/**
 * Serverseitige Zusammenführung: votemanager-Daten holen, nach NKWG rechnen,
 * Ergebnis zwischenspeichern.
 *
 * Läuft nur auf dem Server (votemanager sendet kein CORS).
 */

import { direktwahl, stimmenverhaeltnis, type Sitzverteilung, type Direktergebnis, type Stimmenverhaeltnis } from '$lib/nkwg';
import { rechtsstand } from '$lib/wahlrecht';
import {
	parseErgebnis,
	type Auszaehlstand,
	type VertretungRef
} from '$lib/votemanager';
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
	amtlich?: { anzahl: number; gewaehlte: string[][] };
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

		if (!recht) {
			erg.warnung = `Für ${gesamtZeile.land} ist noch kein Kommunalwahlrecht hinterlegt — angezeigt wird nur das Stimmenverhältnis.`;
			return erg;
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
			return erg;
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
			return erg;
		}
		if (!bereicheVollstaendig) {
			erg.warnung = 'Wahlbereiche sind noch nicht vollständig archiviert — es wird noch keine Mandatsverteilung berechnet.';
			return erg;
		}
		erg.verteilung = recht.verteile(bereiche, n);
		return erg;
	});
}
