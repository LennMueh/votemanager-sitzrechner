/**
 * Serverseitige Zusammenführung: votemanager-Daten holen, nach NKWG rechnen,
 * Ergebnis zwischenspeichern.
 *
 * Läuft nur auf dem Server (votemanager sendet kein CORS).
 */

import { direktwahl, stimmenverhaeltnis, type Sitzverteilung, type Direktergebnis, type Stimmenverhaeltnis } from '$lib/nkwg';
import { rechtsstand } from '$lib/wahlrecht';
import {
	amtlicheGewaehlte,
	parseErgebnis,
	type Auszaehlstand,
	type VertretungRef
} from '$lib/votemanager';
import type { Mandatsart, Sitz } from '$lib/nkwg';
import { db } from './db';
import { vertretungsSchluessel, waehleGegenwahl } from './vergleich';
import sitzzahlen from '$lib/sitzzahlen.json';
import sitzzahlenManuell from '$lib/sitzzahlen-manuell.json';

// Zwei Quellen: sitzzahlen.json schreibt `npm run harvest` vollständig neu,
// sitzzahlen-manuell.json ist handgepflegt und überlebt das.
//
// Die Dateien sind mit `<ags>|<Titel>` geschlüsselt, gesucht wird aber über den
// stabilen Schlüssel: votemanager benennt dieselbe Wahl in jedem Zyklus anders
// („Gemeindewahl" 2021 gegen „Wahl des Gemeinderates" 2026, „Landkreises
// Lüneburg" gegen „Landkreis Lüneburg"). Über den Titel passten von 56
// hinterlegten Sitzzahlen noch fünf auf die 1.945 Vertretungen der Wahl 2026.
const TABELLE = new Map(
	Object.entries({ ...sitzzahlen.vertretungen, ...sitzzahlenManuell.vertretungen }).map(
		([schluessel, wert]) => {
			const trenner = schluessel.indexOf('|');
			return [
				vertretungsSchluessel(schluessel.slice(0, trenner), schluessel.slice(trenner + 1)),
				wert as { sitze: number }
			] as const;
		}
	)
);

/** Sitzzahl einer Vertretung — Vorbelegung, siehe sitzzahlen*.json. */
export function sitzzahl(ref: VertretungRef): number | undefined {
	return TABELLE.get(vertretungsSchluessel(ref.ags, ref.titel, ref.gebietName))?.sitze;
}

/** Woher die verwendete Sitzzahl stammt — gehört sichtbar an das Ergebnis. */
export type Sitzzahlherkunft = 'amtlich' | 'hinterlegt' | 'vorwahl';

export interface Sitzzahlbefund {
	sitze?: number;
	herkunft?: Sitzzahlherkunft;
	/** Alle gefundenen Werte, auch die überstimmten — Grundlage der Konfliktanzeige. */
	quellen: Array<{ herkunft: Sitzzahlherkunft; sitze: number; stand?: string }>;
}

/**
 * Sitzzahl der letzten Wahl derselben Körperschaft, aus dem Archiv.
 *
 * Schwächste Quelle und deshalb zuletzt befragt: sie ist per Definition einen
 * Wahlzyklus alt, und die Sitzzahl folgt der Einwohnerzahl zu einem
 * gesetzlichen Stichtag (§ 46 NKomVG und Entsprechungen). Wächst eine Gemeinde
 * über eine Staffelschwelle, ist der alte Wert falsch. Für Ortsräte ist er
 * trotzdem oft die einzige automatische Quelle — deren Einwohnerzahl
 * veröffentlicht kein Statistikamt.
 *
 * Der Wahltag der Quelle wird mitgeführt: ohne ihn lässt sich später nicht
 * sagen, wie alt die Zahl ist.
 */
async function sitzzahlVorwahl(
	sql: ReturnType<typeof db>,
	ref: VertretungRef,
	wahltag: string
): Promise<{ sitze: number; stand: string } | undefined> {
	const zeilen = await sql<Array<{ wahltag: string; name: string; gebiet_name: string; inhalt: unknown }>>`
		SELECT to_char(t.datum,'YYYYMMDD') wahltag, w.name, w.gebiet_name, d.inhalt
		FROM wahl w
		JOIN termin t ON t.id=w.termin_id
		JOIN instanz i ON i.id=t.instanz_id
		JOIN behoerde b ON b.id=i.behoerde_id
		JOIN pfad_stand p ON p.instanz_id=i.id
			AND p.pfad LIKE '%/wahl_' || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json'
		JOIN LATERAL (SELECT inhalt FROM dokument d WHERE d.pfad_stand_id=p.id ORDER BY id DESC LIMIT 1) d ON true
		WHERE b.kennung=${ref.ags} AND to_char(t.datum,'YYYYMMDD') < ${wahltag}
		ORDER BY t.datum DESC`;

	const gesucht = vertretungsSchluessel(ref.ags, ref.titel, ref.gebietName);
	for (const z of zeilen) {
		if (vertretungsSchluessel(ref.ags, z.name, z.gebiet_name) !== gesucht) continue;
		const anzahl = parseErgebnis(z.inhalt as never).amtlicheSitze?.anzahl;
		if (anzahl) return { sitze: anzahl, stand: z.wahltag };
	}
	return undefined;
}

/**
 * Rangfolge der Sitzzahl-Quellen: amtlich vor hinterlegt vor Vorwahl.
 *
 * Die Vorwahl steht bewusst hinten. Die Sitzzahl folgt der Einwohnerzahl zu
 * einem gesetzlichen Stichtag, und der Wert ist per Definition einen Wahlzyklus
 * alt — im Archiv finden sich dafür echte Belege: der Kreistag Freudenstadt
 * wuchs von 41 (2019) auf 44 (2024), der Gemeinderat Hochdorf schrumpfte von 13
 * auf 12.
 *
 * Abweichungen werden nicht aufgelöst, sondern mitgeführt: sie heißen entweder
 * Wachstum über eine Staffelschwelle oder eine Satzung, die die Zahl senkt
 * (§ 46 Abs. 4 NKomVG und Entsprechungen). Beides will man sehen.
 */
export function waehleSitzzahl(quellen: Sitzzahlbefund['quellen']): Sitzzahlbefund {
	const rang: Record<Sitzzahlherkunft, number> = { amtlich: 0, hinterlegt: 1, vorwahl: 2 };
	const sortiert = [...quellen].sort((a, b) => rang[a.herkunft] - rang[b.herkunft]);
	const [beste] = sortiert;
	return { sitze: beste?.sitze, herkunft: beste?.herkunft, quellen: sortiert };
}

async function bestimmeSitzzahl(
	sql: ReturnType<typeof db>,
	ref: VertretungRef,
	wahltag: string,
	amtlich?: number
): Promise<Sitzzahlbefund> {
	const quellen: Sitzzahlbefund['quellen'] = [];
	if (amtlich) quellen.push({ herkunft: 'amtlich', sitze: amtlich });
	const hinterlegt = sitzzahl(ref);
	if (hinterlegt) quellen.push({ herkunft: 'hinterlegt', sitze: hinterlegt });
	// Die Vorwahl nur befragen, wenn sie etwas ändern kann oder als Gegenprobe
	// dient — die Abfrage kostet einen Datenbankzugriff je Vertretung.
	const vorwahl = wahltag ? await sitzzahlVorwahl(sql, ref, wahltag) : undefined;
	if (vorwahl) quellen.push({ herkunft: 'vorwahl', ...vorwahl });

	return waehleSitzzahl(quellen);
}

// ---------------------------------------------------------------------------
// Cache: der letzte gute Stand überlebt einen Ausfall von votemanager.
// ---------------------------------------------------------------------------

interface Eintrag<T> {
	zeit: number;
	wert: T;
}
// PostgreSQL ist der gemeinsame Cache; lokal bleibt nur der letzte gute Stand für Fehlerfälle.
const FRISCH_MS = 0;
const speicher = new Map<string, Eintrag<unknown>>();

async function zwischengespeichert<T extends object>(schluessel: string, laden: () => Promise<T>): Promise<T & { stale?: boolean }> {
	const alt = speicher.get(schluessel) as Eintrag<T> | undefined;
	if (alt && Date.now() - alt.zeit < FRISCH_MS) return alt.wert;
	try {
		const wert = await laden();
		speicher.set(schluessel, { zeit: Date.now(), wert });
		return wert;
	} catch (e) {
		// Der Wahlabend darf nicht an einem Timeout scheitern: letzten guten
		// Stand weiterreichen und als veraltet kennzeichnen.
		if (alt) return { ...(alt.wert as object), stale: true } as T & { stale: true };
		throw e;
	}
}

// ---------------------------------------------------------------------------
// Übersicht aller Vertretungen
// ---------------------------------------------------------------------------

export interface UebersichtEintrag extends VertretungRef {
	land: string;
	region: string;
	regionName: string;
	vergleichbar: boolean;
	sitze?: number;
	stand?: Auszaehlstand;
	fehler?: string;
}

export interface Uebersicht {
	wahltag: string;
	wahltermine: string[];
	/** Alle bekannten Wahltage mit Anzahl — der Kalender wählt daraus. */
	termine: Wahltermin[];
	zeitpunkt: string;
	eintraege: UebersichtEintrag[];
	stale?: boolean;
}

export function waehleStandardtermin(wahltermine: string[], heute: string): string {
	const sortiert = [...wahltermine].sort();
	return sortiert.find((termin) => termin >= heute) ?? sortiert.at(-1) ?? '';
}

// Der Regionsname (Landkreis o. ä.) hängt nur am Regionalschlüssel, nicht an der
// Zeile. Als Unterabfrage lief er einmal je Ergebniszeile über alle 3143
// behoerde-Zeilen (202 Zeilen ~ 1,5 s); als CTE genau einmal (~7 ms).
export function regionsname(sql: ReturnType<typeof db>) {
	// Im AGS-Schema ist <Regionalschlüssel>000 die Kreisebene selbst. Die zuerst
	// nehmen: kreisfreie Städte heißen "Stadt Emden" und fielen durch die Regex,
	// weshalb sechs niedersächsische Kacheln nur ihren Schlüssel zeigten.
	// Bundesweit bekommen so 103 Regionen einen Namen statt einer Zahl.
	//
	// Ohne Kreisbehörde im Feed bleibt es beim Schlüssel — bei 03353 etwa
	// liefern nur vier Gemeinden, der Landkreis Harburg selbst nicht.
	return sql`SELECT DISTINCT ON (regionalschluessel) regionalschluessel, name FROM behoerde
		WHERE kennung = regionalschluessel || '000'
			OR name ~* '(landkreis|region|städteregion|kreisfreie)'
		ORDER BY regionalschluessel, (kennung <> regionalschluessel || '000'), kennung`;
}

/** Ein Wahltermin mit der Zahl der Wahlen an diesem Tag — Futter für den Kalender. */
export interface Wahltermin {
	datum: string;
	wahlen: number;
}

export async function holeWahltermine(): Promise<{
	termine: Wahltermin[];
	wahltermine: string[];
	standard: string;
}> {
	const sql = db();
	// Die Zahl der Wahlen je Tag gleich mitzählen: der Kalender zeigt damit auf
	// einen Blick, ob ein Tag eine Kommunalwahl trug oder eine einzelne
	// Bürgermeister-Stichwahl. 870 Termine von 1993 bis 2027 sind als Liste
	// unbrauchbar, als Kalender mit Markierungen lesbar.
	const zeilen = await sql<Array<{ datum: string; wahlen: number }>>`
		SELECT to_char(t.datum, 'YYYYMMDD') AS datum, count(w.*)::int AS wahlen
		FROM termin t LEFT JOIN wahl w ON w.termin_id = t.id
		GROUP BY 1 ORDER BY 1`;
	const [{ heute } = { heute: '' }] = await sql<Array<{ heute: string }>>`
		SELECT to_char(current_date, 'YYYYMMDD') AS heute`;
	const wahltermine = zeilen.map((z) => z.datum);
	return { termine: zeilen, wahltermine, standard: waehleStandardtermin(wahltermine, heute) };
}

export async function holeUebersicht(wahltag?: string): Promise<Uebersicht> {
	const termine = await holeWahltermine();
	const ausgewaehlt = wahltag ?? termine.standard;
	if (!ausgewaehlt) return { wahltag: '', wahltermine: [], termine: [], zeitpunkt: new Date().toISOString(), eintraege: [] };
	return zwischengespeichert(`uebersicht:${ausgewaehlt}`, async () => {
		const sql = db();
		const zeilen = await sql<Array<{ instanz_id: number; ags: string; behoerde: string; land: string; region: string; regionName: string; wahl_id: string; gebiet_id: string; gebiet_name: string; titel: string; inhalt: unknown | null }>>`
			WITH regionsname AS (${regionsname(sql)})
			SELECT i.id::int instanz_id, b.kennung ags, b.name behoerde, b.land, b.regionalschluessel region,
				coalesce(r.name, b.regionalschluessel) "regionName",
				w.wahl_id, w.gebiet_id, w.gebiet_name, w.name titel, d.inhalt
			FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
			LEFT JOIN regionsname r ON r.regionalschluessel=b.regionalschluessel
			LEFT JOIN LATERAL (SELECT d.inhalt FROM dokument d JOIN pfad_stand p ON p.id=d.pfad_stand_id
				WHERE p.instanz_id=i.id AND p.pfad LIKE ${'%' + '/wahl_'} || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json'
				ORDER BY d.id DESC LIMIT 1) d ON true
			WHERE t.datum=${`${ausgewaehlt.slice(0, 4)}-${ausgewaehlt.slice(4, 6)}-${ausgewaehlt.slice(6, 8)}`}::date ORDER BY b.name, w.name`;
		const ags = [...new Set(zeilen.map((z) => z.ags))];
		const kandidaten = ags.length ? await sql<Array<{ ags: string; wahltag: string; name: string; gebietName: string }>>`
			SELECT b.kennung ags, to_char(t.datum, 'YYYYMMDD') wahltag, w.name, w.gebiet_name "gebietName"
			FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
			WHERE b.kennung IN ${sql(ags)} AND EXISTS (
				SELECT 1 FROM pfad_stand p JOIN dokument d ON d.pfad_stand_id=p.id
				WHERE p.instanz_id=i.id AND p.pfad LIKE ${'%' + '/wahl_'} || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json')` : [];
		const eintraege = zeilen.map((z): UebersichtEintrag => {
			const ref: VertretungRef = { instanzId: z.instanz_id, ags: z.ags, behoerde: z.behoerde, wahlId: Number(z.wahl_id), gebietId: z.gebiet_id, gebietName: z.gebiet_name, titel: z.titel, direktwahl: /(bürgermeister|landrat|stichwahl)/i.test(z.titel) };
			const vergleichbar = Boolean(z.inhalt && waehleGegenwahl(
				{ ags: z.ags, wahltag: ausgewaehlt, name: z.titel, gebietName: z.gebiet_name },
				kandidaten.filter((k) => k.ags === z.ags)
			));
			return z.inhalt ? { ...ref, land: z.land, region: z.region, regionName: z.regionName, vergleichbar, sitze: sitzzahl(ref), stand: parseErgebnis(z.inhalt as never).stand } : { ...ref, land: z.land, region: z.region, regionName: z.regionName, vergleichbar, sitze: sitzzahl(ref), fehler: 'Noch kein Ergebnis archiviert' };
		});
		return { wahltag: ausgewaehlt, wahltermine: termine.wahltermine, termine: termine.termine, zeitpunkt: new Date().toISOString(), eintraege };
	});
}

// ---------------------------------------------------------------------------
// Einzelne Vertretung berechnen
// ---------------------------------------------------------------------------

export interface VertretungErgebnis {
	ref: VertretungRef;
	stand: Auszaehlstand;
	kennzahlen: Record<string, number>;
	wahlbereiche: string[];
	sitzzahl?: number;
	/** Woher die Sitzzahl stammt und welche Werte konkurrierten. */
	sitzzahlHerkunft?: Sitzzahlherkunft;
	sitzzahlQuellen?: Sitzzahlbefund['quellen'];
	/** Fehlt, wenn keine Sitzzahl hinterlegt ist — dann wird nichts gerechnet. */
	verteilung?: Sitzverteilung;
	/** Partei-/Listensummen der gewählten Gebietsebene, unabhängig von Mandaten. */
	stimmverhaeltnis?: Stimmenverhaeltnis;
	direkt?: Direktergebnis;
	/** Von votemanager selbst veröffentlicht, erst im amtlichen Endergebnis. */
	amtlich?: { anzahl: number; spalten: string[]; gewaehlte: string[][] };
	/** Stammen die angezeigten Sitze aus der amtlichen Liste statt aus der Rechnung? */
	verteilungAmtlich?: boolean;
	/** Abweichungen der eigenen Rechnung vom amtlichen Ergebnis, je Wahlvorschlag. */
	gegenprobe?: string[];
	/** Wonach gerechnet wurde — leer, solange für das Land nichts hinterlegt ist. */
	recht?: {
		land: string;
		name: string;
		rechtsgrundlage: string;
		direktwahl: string;
		sitzzahlBeschluss?: string;
		belegt: boolean;
		vorbehalt?: string;
	};
	warnung?: string;
	zeitpunkt: string;
	stale?: boolean;
}

/**
 * Mandatsart aus dem Wortlaut des Landes ableiten.
 *
 * Die amtlichen Listen schreiben „direkt gewählt" (NI), „Personenwahl" (HE, SN,
 * ST), „Direktmandat" (BW), „Gebietsliste 1" (SL), „Reservelistenplatz 1" (NW)
 * oder schlicht „Gewählt". Der Text wird unverändert angezeigt; die Art dient
 * nur der Form im Sitzdiagramm, deshalb genügt hier eine grobe Zuordnung.
 */
function mandatsart(mandat: string | undefined): Mandatsart {
	if (!mandat) return 'liste';
	if (/direkt|personenwahl|wahlbezirk/i.test(mandat)) return 'personenwahl';
	return 'liste';
}

/**
 * Sitzverteilung aus der amtlichen Liste der Gewählten.
 *
 * Sobald votemanager sie veröffentlicht, ist sie die Wahrheit — auch dort, wo
 * die eigene Rechnung Namen liefern könnte. Im Saarland und in
 * Nordrhein-Westfalen ist sie sogar die einzige Quelle für die Namen, weil dort
 * die Reihenfolge auf dem Wahlvorschlag entscheidet und die während der
 * Auszählung nicht veröffentlicht wird.
 *
 * Farbe und Stimmenanteil kommen aus dem Stimmenverhältnis. Für rund 1,4 % der
 * Gewählten im Archiv findet sich dort kein passender Wahlvorschlag — dann
 * bleibt die Farbe leer und der Name trotzdem lesbar. Das ist die richtige
 * Richtung: der Name ist der Daseinsgrund, die Farbe Beiwerk.
 */
export function amtlicheVerteilung(
	amtlich: { anzahl: number; spalten: string[]; gewaehlte: string[][] },
	stimmen: Stimmenverhaeltnis,
	gerechnet?: Sitzverteilung
): Sitzverteilung {
	const meta = new Map(stimmen.parteien.map((p) => [p.partei, p]));
	const gewaehlte = amtlicheGewaehlte(amtlich.spalten, amtlich.gewaehlte);

	const sitze: Sitz[] = gewaehlte.map((g) => {
		const p = meta.get(g.partei);
		return {
			partei: g.partei,
			parteiLang: p?.parteiLang,
			farbe: p?.farbe,
			name: g.name,
			stimmen: g.stimmen,
			wahlbereich: g.wahlbereich,
			art: mandatsart(g.mandat),
			mandat: g.mandat ?? 'gewählt'
		};
	});

	sitze.push(...fehlendeSitze(amtlich.anzahl, sitze, gerechnet));

	// Die Namen sind die härtere Tatsache als die Zahl: `anzahl` stammt aus der
	// Summe eines Tortendiagramms bzw. aus einem Hinweistext, nicht aus der
	// Gewählten-Tabelle. Nennt die Tabelle mehr Personen als die Zahl behauptet,
	// gilt die Tabelle — im Archiv gibt es das (Ortsbeirat Frankfurt-Mitte/Nord
	// 2016: anzahl 19, zwanzig amtliche Namen).
	const sitzeGesamt = Math.max(amtlich.anzahl, sitze.length);

	// Über alle Sitze zählen, nicht nur über die Gewählten: sonst fällt ein
	// Wahlvorschlag, dessen einziger Sitz unbesetzt bleibt, ganz aus Legende und
	// Sitzdiagramm heraus. `sitze` ist damit wie in der eigenen Rechnung die
	// Zuteilung einschließlich unbesetzter Plätze.
	const jePartei = new Map<string, number>();
	for (const s of sitze) {
		if (!s.partei) continue;
		jePartei.set(s.partei, (jePartei.get(s.partei) ?? 0) + 1);
	}

	return {
		sitzeGesamt,
		gueltigeStimmen: stimmen.stimmenGesamt,
		parteien: [...jePartei].map(([partei, anzahl]) => ({
			partei,
			parteiLang: meta.get(partei)?.parteiLang,
			farbe: meta.get(partei)?.farbe,
			stimmen: meta.get(partei)?.stimmen ?? 0,
			prozent: meta.get(partei)?.prozent ?? 0,
			sitze: anzahl
		})).sort((a, b) => b.sitze - a.sitze || b.stimmen - a.stimmen),
		sitze,
		losentscheide: [],
		losfaelle: []
	};
}

/**
 * Die Lücke zwischen amtlicher Sitzzahl und amtlich Gewählten als unbesetzte
 * Sitze — Invariante: Gewählte + Unbesetzte === Sitzzahl.
 *
 * Die amtliche Liste führt nur, wer gewählt ist; bleibt ein Sitz nach § 36 Abs. 7
 * NKWG (und den Entsprechungen) unbesetzt, steht dort schlicht keine Zeile. Ohne
 * Auffüllen zeigte das Sitzdiagramm sechs Punkte, während die Seite daneben
 * „7 Sitze, amtlich" schrieb. Im Referenzkorpus trifft das 20 von 785 Fällen.
 *
 * Wem der leere Platz zufiele, sagt die amtliche Liste nicht — die eigene
 * Rechnung schon. Übernommen wird sie aber nur, wenn sie die Lücke **vollständig**
 * erklärt: gleich viele unbesetzte Sitze, und bei den Besetzten je Wahlvorschlag
 * Übereinstimmung. Das ist kein Zirkelschluss, weil `gegenprobe()` genau diese
 * Übereinstimmung unabhängig prüft und unbesetzte Sitze dabei ignoriert.
 * Andernfalls bleibt der Sitz ohne Wahlvorschlag: die Invariante gilt, ohne eine
 * Zuordnung zu behaupten, für die es keinen Beleg gibt.
 */
function fehlendeSitze(anzahl: number, gewaehlt: Sitz[], gerechnet?: Sitzverteilung): Sitz[] {
	const fehlend = anzahl - gewaehlt.length;
	if (fehlend <= 0) return [];

	const eigene = gerechnet?.sitze.filter((s) => s.unbesetzt) ?? [];
	if (eigene.length === fehlend && gerechnet) {
		const links = besetzteJePartei(gerechnet.sitze);
		const rechts = besetzteJePartei(gewaehlt);
		const parteien = new Set([...links.keys(), ...rechts.keys()]);
		const einig = [...parteien].every((p) => (links.get(p) ?? 0) === (rechts.get(p) ?? 0));
		if (einig) return eigene.map((s) => ({ ...s }));
	}

	return Array.from({ length: fehlend }, () => ({
		partei: '',
		art: 'unbesetzt' as const,
		mandat: 'unbesetzt',
		unbesetzt: true,
		grund: 'Die amtliche Liste nennt weniger Gewählte als Sitze'
	}));
}

/**
 * Besetzte Sitze je Wahlvorschlag — unbesetzte zählen nicht mit.
 *
 * Gezählt wird über `sitze`, nicht über `parteien[].sitze`: letzteres ist auf der
 * gerechneten Seite die *Zuteilung* und enthält damit auch die Sitze, die nach
 * § 36 Abs. 7 NKWG (und den Entsprechungen) unbesetzt bleiben.
 */
function besetzteJePartei(sitze: Sitz[]): Map<string, number> {
	const zahl = new Map<string, number>();
	for (const s of sitze) {
		if (s.unbesetzt) continue;
		zahl.set(s.partei, (zahl.get(s.partei) ?? 0) + 1);
	}
	return zahl;
}

/**
 * Eigene Rechnung gegen das amtliche Ergebnis — der Referenztest zur Laufzeit.
 *
 * Verglichen werden nur die Sitze je Wahlvorschlag, nicht die Namen: wo die
 * Listenreihenfolge entscheidet, kann die eigene Rechnung keine Namen liefern,
 * und eine Meldung darüber wäre Lärm. Eine Abweichung hier heißt dagegen, dass
 * für das Land das falsche Recht hinterlegt ist — das will man am Wahlabend
 * sehen und nicht erst bei der nächsten Ernte.
 *
 * Verglichen werden ausdrücklich die **besetzten** Sitze. Über `parteien[].sitze`
 * war das ein Fehlalarm: der Ortsrat Oedeme 2021 meldete „GRÜNE: gerechnet 3,
 * amtlich 2", obwohl die Rechnung stimmte — die GRÜNEN bekamen drei Sitze und
 * hatten nur zwei Bewerber. Die amtliche Liste führt eben nur Gewählte; dieselbe
 * Korrektur macht `referenzen.test.ts` seit jeher. Der Vergleich ist damit
 * zugleich unabhängig davon, ob die amtliche Verteilung aufgefüllt wurde.
 */
export function gegenprobe(gerechnet: Sitzverteilung | undefined, amtlich: Sitzverteilung): string[] {
	if (!gerechnet) return [];
	const links = besetzteJePartei(gerechnet.sitze);
	const rechts = besetzteJePartei(amtlich.sitze);
	const parteien = [...new Set([...links.keys(), ...rechts.keys()])].filter(Boolean);
	return parteien
		.filter((partei) => (links.get(partei) ?? 0) !== (rechts.get(partei) ?? 0))
		.map((partei) => `${partei}: gerechnet ${links.get(partei) ?? 0}, amtlich ${rechts.get(partei) ?? 0}`);
}

export async function berechneVertretung(
	ags: string | undefined,
	wahlId: number,
	gebietId: string,
	wahltag?: string,
	instanzId?: number
): Promise<VertretungErgebnis> {
	const ausgewaehlt = wahltag ?? (instanzId ? '' : (await holeWahltermine()).standard);
	if (!instanzId && !ausgewaehlt) throw new Error('Noch kein Wahltermin bekannt');
	// Der Datum-Parameter wird auch im Instanz-Zweig typisiert, dort aber nicht ausgewertet.
	const datum = ausgewaehlt ? `${ausgewaehlt.slice(0, 4)}-${ausgewaehlt.slice(4, 6)}-${ausgewaehlt.slice(6, 8)}` : '1970-01-01';
	return zwischengespeichert(`v:${instanzId ? `i${instanzId}` : `${ausgewaehlt}:${ags}`}:${wahlId}:${gebietId}`, async () => {
		const sql = db();
		const zeilen = await sql<Array<{ instanz_id: number; ags: string; behoerde: string; land: string; titel: string; gebiet_name: string; wahltag: string; pfad: string; wahlbereich: string | null; inhalt: unknown; erfasst_am: Date }>>`
			SELECT i.id::int instanz_id, b.kennung ags, b.name behoerde, b.land, w.name titel, w.gebiet_name,
				to_char(t.datum,'YYYYMMDD') wahltag, p.pfad, d.inhalt, d.erfasst_am,
				(SELECT g.name FROM gebiet g JOIN uebersicht_ebene e ON e.id=g.uebersicht_ebene_id
					WHERE e.instanz_id=i.id AND e.wahl_id=w.wahl_id AND e.art='wahlbereich'
						AND p.pfad LIKE '%/ergebnis_' || g.gebiet_id || '_0.json' LIMIT 1) wahlbereich
			FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
			JOIN pfad_stand p ON p.instanz_id=i.id AND p.pfad LIKE ${`%/wahl_${wahlId}/ergebnis_%_0.json`}
			JOIN LATERAL (SELECT d.inhalt, d.erfasst_am FROM dokument d WHERE d.pfad_stand_id=p.id ORDER BY d.id DESC LIMIT 1) d ON true
			WHERE w.wahl_id=${String(wahlId)} AND w.gebiet_id=${gebietId}
				AND (${instanzId ?? null}::bigint IS NOT NULL AND i.id=${instanzId ?? null}
					OR ${instanzId ?? null}::bigint IS NULL AND b.kennung=${ags ?? ''} AND t.datum=${datum}::date)
				AND (p.pfad LIKE ${`%/ergebnis_${gebietId}_0.json`} OR EXISTS (
					SELECT 1 FROM gebiet g JOIN uebersicht_ebene e ON e.id=g.uebersicht_ebene_id
					WHERE e.instanz_id=i.id AND e.wahl_id=w.wahl_id AND e.art='wahlbereich'
						AND p.pfad LIKE '%/ergebnis_' || g.gebiet_id || '_0.json'
				))`;
		if (!zeilen.length) throw new Error(`Kein archiviertes Ergebnis für ${ags}/${wahlId}/${gebietId}`);
		const gesamtZeile = zeilen.find((z) => z.pfad.endsWith(`ergebnis_${gebietId}_0.json`));
		if (!gesamtZeile) throw new Error('Wahlgebietsergebnis fehlt noch');
		const ref: VertretungRef = { instanzId: gesamtZeile.instanz_id, ags: gesamtZeile.ags, behoerde: gesamtZeile.behoerde, wahlId, gebietId, gebietName: gesamtZeile.gebiet_name, titel: gesamtZeile.titel, direktwahl: /(bürgermeister|landrat|stichwahl)/i.test(gesamtZeile.titel) };
		const gesamt = parseErgebnis(gesamtZeile.inhalt as never);
		const teile = zeilen.filter((z) => z !== gesamtZeile).map((z) => ({ id: z.pfad.match(/ergebnis_(.+)_0\.json$/)?.[1] ?? z.pfad, name: z.wahlbereich, ergebnis: parseErgebnis(z.inhalt as never) }));
		const summe = (v: typeof gesamt.vorschlaege) => v.reduce((s, x) => s + x.listenstimmen + x.kandidaten.reduce((a, k) => a + k.stimmen, 0), 0);
		const bereicheVollstaendig = teile.length === 0 || teile.reduce((s, x) => s + summe(x.ergebnis.vorschlaege), 0) === summe(gesamt.vorschlaege);
		const bereiche = teile.length && bereicheVollstaendig ? teile.map((x) => ({ id: x.id, name: x.name ?? x.id, vorschlaege: x.ergebnis.vorschlaege })) : [{ id: gebietId, name: ref.titel, vorschlaege: gesamt.vorschlaege }];
		const erg: VertretungErgebnis = {
			ref,
			stand: gesamt.stand,
			kennzahlen: gesamt.kennzahlen,
			wahlbereiche: bereiche.map((b) => b.name),
			amtlich: gesamt.amtlicheSitze,
			zeitpunkt: gesamtZeile.erfasst_am.toISOString()
		};

		// Ohne hinterlegten Rechtsstand wird nicht gerechnet — kein stiller
		// Rückfall auf das NKWG in einem Land, für das es nicht gilt.
		const recht = rechtsstand(gesamtZeile.land);
		if (recht) {
			erg.recht = {
				land: recht.land,
				name: recht.name,
				rechtsgrundlage: recht.rechtsgrundlage,
				direktwahl: recht.direktwahl.rechtsgrundlage,
				sitzzahlBeschluss: recht.sitzzahlBeschluss,
				belegt: recht.belegt,
				vorbehalt: recht.vorbehalt
			};
		}

		if (ref.direktwahl) {
			erg.direkt = direktwahl(gesamt.direktBewerber);
			return erg;
		}
		erg.stimmverhaeltnis = stimmenverhaeltnis([
			{ id: gebietId, name: ref.titel, vorschlaege: gesamt.vorschlaege }
		]);

		/**
		 * Letzter Schritt vor jeder Rückgabe: liegt die amtliche Liste der
		 * Gewählten vor, ersetzt sie die gerechnete Verteilung. Sie ist die
		 * Wahrheit — und im Saarland und in Nordrhein-Westfalen die einzige
		 * Quelle für die Namen, weil dort die Listenreihenfolge entscheidet.
		 *
		 * Die eigene Rechnung wird nicht weggeworfen, sondern gegengeprüft. Das
		 * ist der Referenztest zur Laufzeit: eine Abweichung heißt, dass für das
		 * Land das falsche Recht hinterlegt ist.
		 */
		const fertig = (): VertretungErgebnis => {
			if (!gesamt.amtlicheSitze?.gewaehlte.length || !erg.stimmverhaeltnis) return erg;
			const amtlicheVert = amtlicheVerteilung(gesamt.amtlicheSitze, erg.stimmverhaeltnis, erg.verteilung);
			// Auf besetzte Sitze prüfen, nicht auf die Gesamtzahl: fehlt in der Tabelle
			// die Namensspalte, liefert `amtlicheGewaehlte()` nichts, und das Auffüllen
			// ergäbe eine Verteilung aus lauter leeren Plätzen. Die eigene Rechnung ist
			// dann die bessere Auskunft.
			if (!amtlicheVert.sitze.some((s) => !s.unbesetzt)) return erg;
			erg.gegenprobe = gegenprobe(erg.verteilung, amtlicheVert);
			erg.verteilung = amtlicheVert;
			erg.verteilungAmtlich = true;
			// Die Warnung „keine Sitzverteilung verfügbar" gilt nicht mehr, wenn die
			// amtliche Liste da ist — sie stammt aus dem Zweig ohne Sitzzahl.
			if (erg.warnung?.startsWith('Für diese Auswahl ist keine Sitzverteilung')) erg.warnung = undefined;
			return erg;
		};

		if (!recht) {
			erg.warnung = `Für ${gesamtZeile.land} ist noch kein Kommunalwahlrecht hinterlegt — angezeigt wird nur das Stimmenverhältnis.`;
			return fertig();
		}

		// Amtliche Sitzzahl schlägt alles, sobald votemanager sie liefert; darunter
		// die hinterlegte Tabelle, zuletzt die Sitzzahl der Vorwahl aus dem Archiv.
		const befund = await bestimmeSitzzahl(sql, ref, gesamtZeile.wahltag, gesamt.amtlicheSitze?.anzahl);
		const n = befund.sitze;
		erg.sitzzahl = n;
		erg.sitzzahlHerkunft = befund.herkunft;
		erg.sitzzahlQuellen = befund.quellen;
		if (!n) {
			erg.warnung = 'Für diese Auswahl ist keine Sitzverteilung verfügbar — angezeigt wird das Stimmenverhältnis.';
			return fertig();
		}
		if (!recht.wahlbereiche) {
			// Verteilt das Land nicht über Wahlbereiche zwischen (alle außer
			// Niedersachsen), genügt das Wahlgebietsergebnis — es enthält ohnehin
			// alle Wahlvorschläge und Bewerber. Bewusst ohne die
			// Vollständigkeits-Gegenprobe: die Bereichs-Snapshots stammen aus
			// verschiedenen Sekunden und summieren sich während der Auszählung nur
			// selten exakt auf das Gesamtergebnis.
			erg.verteilung = recht.verteile(
				[{ id: gebietId, name: ref.titel, vorschlaege: gesamt.vorschlaege }],
				n
			);
			return fertig();
		}
		if (!bereicheVollstaendig) {
			erg.warnung = 'Wahlbereiche sind noch nicht vollständig archiviert — es wird noch keine Mandatsverteilung berechnet.';
			return fertig();
		}
		erg.verteilung = recht.verteile(bereiche, n);
		return fertig();
	});
}
