/**
 * Datenschicht für die votemanager-JSON-API (KDO).
 *
 * Der gesamte Netzabruf liegt hinter `ladeVertretung()` — damit bleibt offen,
 * ob das später in einer Server-Route, einem Worker oder einem Build-Skript
 * läuft (siehe Plan, Abschnitt „Deployment").
 *
 * Achtung: votemanager sendet keine CORS-Header. Dieses Modul darf deshalb nur
 * serverseitig laufen, nicht im Browser.
 */

import type { Wahlbereich, Wahlvorschlag, Kandidat, DirektBewerber } from './nkwg';

export const BASIS = 'https://votemanager.kdo.de';

/** Kommunalwahl Niedersachsen 2026. Stichwahlen am 27.09.2026. */
export const WAHLTAG = '20260913';

/** Die zwölf Behörden im Landkreis Lüneburg (aus config.json → behoerden_links). */
export const BEHOERDEN: { ags: string; name: string }[] = [
	{ ags: '03355000', name: 'Landkreis Lüneburg' },
	{ ags: '03355001', name: 'Gemeinde Adendorf' },
	{ ags: '03355009', name: 'Stadt Bleckede' },
	{ ags: '03355022', name: 'Hansestadt Lüneburg' },
	{ ags: '03355049', name: 'Gemeinde Amt Neuhaus' },
	{ ags: '033555401', name: 'Samtgemeinde Amelinghausen' },
	{ ags: '033555402', name: 'Samtgemeinde Bardowick' },
	{ ags: '033555403', name: 'Samtgemeinde Dahlenburg' },
	{ ags: '033555404', name: 'Samtgemeinde Gellersen' },
	{ ags: '033555405', name: 'Samtgemeinde Ilmenau' },
	{ ags: '033555406', name: 'Samtgemeinde Ostheide' },
	{ ags: '033555407', name: 'Samtgemeinde Scharnebeck' }
];

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

/**
 * votemanager liefert deutsch formatierte Zahlen als Strings: „12.792", „27,61 %".
 * Punkt ist Tausendertrenner, Komma Dezimaltrenner.
 */
export function parseZahl(wert: string | number | null | undefined): number {
	if (typeof wert === 'number') return wert;
	if (!wert) return 0;
	const bereinigt = wert.replace(/\s|%/g, '').replace(/\./g, '').replace(/,/g, '.');
	const n = Number.parseFloat(bereinigt);
	return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Abruf mit Cache
// ---------------------------------------------------------------------------

interface CacheEintrag {
	zeit: number;
	wert: unknown;
}
const cache = new Map<string, CacheEintrag>();
const CACHE_MS = 30_000;

/** Nur für Tests: Cache leeren. */
export function cacheLeeren(): void {
	cache.clear();
}

/**
 * votemanager ist nicht unsere Infrastruktur. Die Übersicht würde sonst rund
 * sechzig Anfragen gleichzeitig auslösen — deshalb ein globales Limit.
 */
const MAX_PARALLEL = 6;
let laufend = 0;
const warteschlange: (() => void)[] = [];

async function mitLimit<T>(auf: () => Promise<T>): Promise<T> {
	if (laufend >= MAX_PARALLEL) await new Promise<void>((f) => warteschlange.push(f));
	laufend++;
	try {
		return await auf();
	} finally {
		laufend--;
		warteschlange.shift()?.();
	}
}

async function holeJson<T>(pfad: string): Promise<T> {
	const treffer = cache.get(pfad);
	if (treffer && Date.now() - treffer.zeit < CACHE_MS) return treffer.wert as T;

	const wert = await mitLimit(async () => {
		const antwort = await fetch(`${BASIS}/${pfad}`, { headers: { accept: 'application/json' } });
		if (!antwort.ok) throw new Error(`votemanager ${antwort.status} bei ${pfad}`);
		return (await antwort.json()) as T;
	});
	cache.set(pfad, { zeit: Date.now(), wert });
	return wert;
}

// ---------------------------------------------------------------------------
// Rohtypen der API (nur was wir tatsächlich lesen)
// ---------------------------------------------------------------------------

interface RohLabel {
	labelKurz?: string;
	labelLang?: string;
}
interface RohZeile {
	color?: string;
	label: RohLabel | string;
	zahl: string;
	sub_zeilen?: RohZeile[];
}
interface RohErgebnis {
	Komponente: {
		tabelle?: { zeilen: RohZeile[] };
		info?: { titel?: string; hinweis?: string[]; tabelle?: { zeilen: RohZeile[] } };
		sitze?: { hinweis?: string; tortenDiagramm?: { entries?: Array<{ value?: number | string; zahl?: number | string }> }; tabelle?: { ueberschriften: string[]; zeilen: string[][] } };
	};
}
interface RohUebersicht {
	tabelle: {
		zeilen: { label: string; statusString?: string; link?: { id: string; type: string } }[];
	};
}
interface RohTermin {
	wahleintraege: {
		wahl: { id: number; titel: string };
		gebiet_link: { id: string; type: string; title: string };
	}[];
}
interface RohWahl {
	titel: string;
	datum: string;
	status?: { stand?: string };
	menu_links?: { id: string; type: string; title: string }[];
}

const kurz = (l: RohLabel | string): string =>
	typeof l === 'string' ? l : (l.labelKurz ?? l.labelLang ?? '');
const lang = (l: RohLabel | string): string | undefined =>
	typeof l === 'string' ? undefined : l.labelLang;

// ---------------------------------------------------------------------------
// Entdeckung: welche Vertretungen gibt es?
// ---------------------------------------------------------------------------

export interface VertretungRef {
	/** Eindeutige Wahltermin-Instanz im Archiv. */
	instanzId?: number;
	ags: string;
	behoerde: string;
	wahlId: number;
	gebietId: string;
	titel: string;
	/** Direktwahlen (Bürgermeister/Landrat) laufen nach § 45g, nicht nach § 36/37. */
	direktwahl: boolean;
}

const istDirektwahl = (titel: string): boolean =>
	/(bürgermeister|landrat|landrät|direktwahl|stichwahl)/i.test(titel);

/**
 * Alle Vertretungen im Landkreis, über alle zwölf Behörden.
 *
 * Die Kreiswahl taucht in jeder Behörde als eigene Ansicht auf — sie wird nur
 * einmal, auf Ebene des Landkreises, übernommen.
 */
export async function holeVertretungen(wahltag = WAHLTAG): Promise<VertretungRef[]> {
	const alle: VertretungRef[] = [];
	const ergebnisse = await Promise.allSettled(
		BEHOERDEN.map(async (b) => ({
			b,
			termin: await holeJson<RohTermin>(`${wahltag}/${b.ags}/api/praesentation/termin.json`)
		}))
	);

	for (const e of ergebnisse) {
		if (e.status !== 'fulfilled') continue;
		const { b, termin } = e.value;
		for (const w of termin.wahleintraege ?? []) {
			// Kreiswahl nur beim Landkreis selbst führen, nicht 12-fach.
			const istKreisebene = b.ags === BEHOERDEN[0].ags;
			if (/kreiswahl/i.test(w.wahl.titel) && !istKreisebene) continue;
			alle.push({
				ags: b.ags,
				behoerde: b.name,
				wahlId: w.wahl.id,
				gebietId: w.gebiet_link.id,
				titel: w.wahl.titel,
				direktwahl: istDirektwahl(w.wahl.titel)
			});
		}
	}
	return alle;
}

// ---------------------------------------------------------------------------
// Ergebnis eines Gebiets lesen
// ---------------------------------------------------------------------------

const S_GESAMT = ' - Summe Partei- und Kandidaten-Stimmen';
const S_LISTE = ' - Stimmen für die Partei';
const S_KANDIDATEN = ' - Summe Kandidaten-Stimmen';

export interface Auszaehlstand {
	eingegangen: number;
	erwartet: number;
	text: string;
	vollstaendig: boolean;
}

export interface GebietsErgebnis {
	vorschlaege: Wahlvorschlag[];
	direktBewerber: DirektBewerber[];
	stand: Auszaehlstand;
	/** Nur im amtlichen Endergebnis vorhanden — am Wahlabend nicht. */
	amtlicheSitze?: { anzahl: number; gewaehlte: string[][] };
	kennzahlen: Record<string, number>;
}

function parseStand(hinweise: string[] | undefined): Auszaehlstand {
	const text = (hinweise ?? []).join(' ');
	const m = text.match(/([\d.]+)\s+von\s+([\d.]+)/);
	const eingegangen = m ? parseZahl(m[1]) : 0;
	const erwartet = m ? parseZahl(m[2]) : 0;
	return {
		eingegangen,
		erwartet,
		text: m ? `${eingegangen} von ${erwartet}` : (hinweise?.[0] ?? 'unbekannt'),
		vollstaendig: erwartet > 0 && eingegangen >= erwartet
	};
}

export function parseErgebnis(roh: RohErgebnis): GebietsErgebnis {
	const k = roh.Komponente ?? {};
	const zeilen = k.tabelle?.zeilen ?? [];
	const nachPartei = new Map<string, Wahlvorschlag>();
	const direktBewerber: DirektBewerber[] = [];

	const hole = (name: string, farbe?: string, langname?: string): Wahlvorschlag => {
		let v = nachPartei.get(name);
		if (!v) {
			v = { partei: name, parteiLang: langname, farbe, listenstimmen: 0, kandidaten: [] };
			nachPartei.set(name, v);
		}
		if (!v.farbe && farbe) v.farbe = farbe;
		if (!v.parteiLang && langname) v.parteiLang = langname;
		return v;
	};

	// Zeilen, die zu keiner der drei Parteizeilen gehören. Was daraus wird,
	// entscheidet sich erst nach dem Durchlauf: bei einer Ratswahl sind es
	// Einzelwahlvorschläge, bei einer Direktwahl die Bewerber selbst.
	const sonstige: RohZeile[] = [];

	for (const z of zeilen) {
		const label = kurz(z.label);
		const langLabel = lang(z.label);

		if (label.endsWith(S_LISTE)) {
			const name = label.slice(0, -S_LISTE.length);
			hole(name, z.color, langLabel?.replace(S_LISTE, '')).listenstimmen = parseZahl(z.zahl);
			continue;
		}
		if (label.endsWith(S_KANDIDATEN)) {
			const name = label.slice(0, -S_KANDIDATEN.length);
			const v = hole(name, z.color, langLabel?.replace(S_KANDIDATEN, ''));
			// sub_zeilen stehen in Listenplatz-Reihenfolge (Reihenfolge des Stimmzettels).
			v.kandidaten = (z.sub_zeilen ?? []).map(
				(s, i): Kandidat => ({
					name: kurz(s.label),
					stimmen: parseZahl(s.zahl),
					listenplatz: i + 1
				})
			);
			continue;
		}
		if (label.endsWith(S_GESAMT)) continue; // redundant, ergibt sich aus Liste + Bewerbern

		sonstige.push(z);
	}

	if (nachPartei.size > 0) {
		// Ratswahl: übrige Zeilen sind Einzelwahlvorschläge (§ 37 Abs. 1).
		// Format: „Alexander Cohn, Einzelbewerber Cohn" — Person, dann Wahlvorschlag.
		for (const z of sonstige) {
			const label = kurz(z.label);
			const trenner = label.lastIndexOf(', ');
			const person = trenner > 0 ? label.slice(0, trenner) : label;
			const vorschlag = trenner > 0 ? label.slice(trenner + 2) : label;
			nachPartei.set(vorschlag, {
				partei: vorschlag,
				parteiLang: lang(z.label),
				farbe: z.color,
				listenstimmen: 0,
				einzelbewerber: true,
				kandidaten: [{ name: person, stimmen: parseZahl(z.zahl), listenplatz: 1 }]
			});
		}
	} else {
		// Keine der drei Parteizeilen gefunden. Zwei Fälle sehen an dieser Stelle
		// gleich aus und lassen sich am Dokument nicht unterscheiden:
		//
		//   - Direktwahl (§ 45g NKWG): eine Zeile je Bewerber.
		//   - reine Listenwahl ohne Kandidatenstimmen. Das Saarland wählt so
		//     (§ 41 KWG SL, geschlossene Listen, eine Stimme je Wähler); der Feed
		//     liefert dort eine flache Tabelle „SPD | 2.118" ganz ohne sub_zeilen.
		//
		// Welcher Fall vorliegt, weiß nur der Aufrufer über den Wahltitel.
		// Deshalb beide Sichten füllen und ihn entscheiden lassen — sonst landen
		// saarländische Listen als „Bewerber" im Direktwahl-Zweig und das
		// Stimmenverhältnis bleibt leer.
		for (const z of sonstige) {
			const name = kurz(z.label);
			direktBewerber.push({ name, farbe: z.color, stimmen: parseZahl(z.zahl) });
			nachPartei.set(name, {
				partei: name,
				parteiLang: lang(z.label),
				farbe: z.color,
				listenstimmen: parseZahl(z.zahl),
				kandidaten: []
			});
		}
	}

	const kennzahlen: Record<string, number> = {};
	for (const z of k.info?.tabelle?.zeilen ?? []) kennzahlen[kurz(z.label)] = parseZahl(z.zahl);

	const sitzeRoh = k.sitze;
	const sitzSumme = sitzeRoh?.tortenDiagramm?.entries?.reduce((summe, e) => summe + parseZahl(e.value ?? e.zahl), 0) ?? 0;
	const sitzAnzahl = sitzSumme || parseZahl(sitzeRoh?.hinweis?.match(/([\d.]+)\s*Sitze/)?.[1] ?? '0');
	const amtlicheSitze = sitzeRoh && sitzAnzahl
		? {
				anzahl: sitzAnzahl,
				gewaehlte: sitzeRoh.tabelle?.zeilen ?? []
			}
		: undefined;

	return {
		vorschlaege: [...nachPartei.values()],
		direktBewerber,
		stand: parseStand(k.info?.hinweis),
		amtlicheSitze,
		kennzahlen
	};
}

// ---------------------------------------------------------------------------
// Wahlbereiche einer Vertretung bestimmen
// ---------------------------------------------------------------------------

const gesamt = (v: Wahlvorschlag): number =>
	v.listenstimmen + v.kandidaten.reduce((s, k) => s + k.stimmen, 0);

const stimmensumme = (vs: Wahlvorschlag[]): number => vs.reduce((s, v) => s + gesamt(v), 0);

/**
 * Sucht die Wahlbereiche einer Vertretung.
 *
 * Es gibt keine verlässliche Angabe, ob eine Übersichts-Ebene wirklich zu
 * *unserem* Wahlgebiet gehört — bei Gemeindewahlen teilen sich mehrere Gemeinden
 * dieselbe Wahl-ID. Deshalb wird gegengerechnet: nur wenn die Summe der
 * Wahlbereiche die Gesamtstimmen des Wahlgebiets trifft, werden sie verwendet.
 * Sonst gilt die Vertretung als Ein-Wahlbereich-Fall (§ 36).
 */
async function holeWahlbereiche(
	wahltag: string,
	ref: VertretungRef,
	gesamtergebnis: GebietsErgebnis
): Promise<Wahlbereich[]> {
	const einer: Wahlbereich[] = [
		{ id: ref.gebietId, name: ref.titel, vorschlaege: gesamtergebnis.vorschlaege }
	];

	const pfad = `${wahltag}/${ref.ags}/api/praesentation/wahl_${ref.wahlId}`;
	let wahl: RohWahl;
	try {
		wahl = await holeJson<RohWahl>(`${pfad}/wahl.json`);
	} catch {
		return einer;
	}

	const ebene = wahl.menu_links?.find(
		(m) => m.type === 'uebersicht' && /wahlbereich/i.test(m.title)
	);
	if (!ebene) return einer;

	let uebersicht: RohUebersicht;
	try {
		uebersicht = await holeJson<RohUebersicht>(`${pfad}/uebersicht_${ebene.id}_0.json`);
	} catch {
		return einer;
	}

	// Die Übersicht enthält auch eine Summenzeile für das Wahlgebiet selbst.
	const kandidatenZeilen = (uebersicht.tabelle?.zeilen ?? []).filter(
		(z) => z.link?.id && z.link.id !== ref.gebietId && z.link.id.startsWith(`${ebene.id}_id_`)
	);
	if (kandidatenZeilen.length < 2) return einer;

	const geladen = await Promise.all(
		kandidatenZeilen.map(async (z) => {
			const roh = await holeJson<RohErgebnis>(`${pfad}/ergebnis_${z.link!.id}_0.json`);
			return { id: z.link!.id, name: z.label, ergebnis: parseErgebnis(roh) };
		})
	);

	// Gegenprobe: Summe der Wahlbereiche muss das Gesamtergebnis treffen.
	const summe = geladen.reduce((s, g) => s + stimmensumme(g.ergebnis.vorschlaege), 0);
	if (summe !== stimmensumme(gesamtergebnis.vorschlaege)) return einer;

	return geladen.map((g) => ({ id: g.id, name: g.name, vorschlaege: g.ergebnis.vorschlaege }));
}

// ---------------------------------------------------------------------------
// Öffentlicher Einstiegspunkt
// ---------------------------------------------------------------------------

export interface VertretungDaten {
	ref: VertretungRef;
	stand: Auszaehlstand;
	kennzahlen: Record<string, number>;
	bereiche: Wahlbereich[];
	direktBewerber: DirektBewerber[];
	/** Nur nach Abschluss der Auszählung von votemanager selbst veröffentlicht. */
	amtlicheSitze?: { anzahl: number; gewaehlte: string[][] };
	zeitpunkt: string;
}

/**
 * Lädt alle Daten einer Vertretung. Einziger Netz-Einstiegspunkt der Anwendung.
 */
export async function ladeVertretung(
	ref: VertretungRef,
	wahltag = WAHLTAG,
	/** `nurStand`: spart das Laden der Wahlbereiche, wenn nur der Auszählungsstand gebraucht wird. */
	optionen: { nurStand?: boolean } = {}
): Promise<VertretungDaten> {
	const pfad = `${wahltag}/${ref.ags}/api/praesentation/wahl_${ref.wahlId}`;
	const roh = await holeJson<RohErgebnis>(`${pfad}/ergebnis_${ref.gebietId}_0.json`);
	const ergebnis = parseErgebnis(roh);

	const bereiche =
		ref.direktwahl || optionen.nurStand ? [] : await holeWahlbereiche(wahltag, ref, ergebnis);

	return {
		ref,
		stand: ergebnis.stand,
		kennzahlen: ergebnis.kennzahlen,
		bereiche,
		direktBewerber: ergebnis.direktBewerber,
		amtlicheSitze: ergebnis.amtlicheSitze,
		zeitpunkt: new Date().toISOString()
	};
}
