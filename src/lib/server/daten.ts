/**
 * Serverseitige Zusammenführung: votemanager-Daten holen, nach NKWG rechnen,
 * Ergebnis zwischenspeichern.
 *
 * Läuft nur auf dem Server (votemanager sendet kein CORS).
 */

import { verteileSitze, direktwahl, stimmenverhaeltnis, type Sitzverteilung, type Direktergebnis, type Stimmenverhaeltnis } from '$lib/nkwg';
import {
	parseErgebnis,
	type Auszaehlstand,
	type VertretungRef
} from '$lib/votemanager';
import { db } from './db';
import { waehleGegenwahl } from './vergleich';
import sitzzahlen from '$lib/sitzzahlen.json';

const TABELLE = sitzzahlen.vertretungen as Record<string, { sitze: number; behoerde: string }>;

/** Sitzzahl einer Vertretung — Vorbelegung aus 2021, siehe sitzzahlen.json. */
export function sitzzahl(ref: VertretungRef): number | undefined {
	return TABELLE[`${ref.ags}|${ref.titel}`]?.sitze;
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
	return sql`SELECT DISTINCT ON (regionalschluessel) regionalschluessel, name FROM behoerde
		WHERE name ~* '(landkreis|region|städteregion|kreisfreie)' ORDER BY regionalschluessel, kennung`;
}

export async function holeWahltermine(): Promise<{ wahltermine: string[]; standard: string }> {
	const [zeile] = await db()<Array<{ wahltermine: string[]; heute: string }>>`
		SELECT coalesce(array_agg(DISTINCT to_char(datum, 'YYYYMMDD') ORDER BY to_char(datum, 'YYYYMMDD')), '{}') AS wahltermine,
			to_char(current_date, 'YYYYMMDD') AS heute
		FROM termin`;
	const wahltermine = zeile?.wahltermine ?? [];
	return { wahltermine, standard: waehleStandardtermin(wahltermine, zeile?.heute ?? '') };
}

export async function holeUebersicht(wahltag?: string): Promise<Uebersicht> {
	const termine = await holeWahltermine();
	const ausgewaehlt = wahltag ?? termine.standard;
	if (!ausgewaehlt) return { wahltag: '', wahltermine: [], zeitpunkt: new Date().toISOString(), eintraege: [] };
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
			const ref: VertretungRef = { instanzId: z.instanz_id, ags: z.ags, behoerde: z.behoerde, wahlId: Number(z.wahl_id), gebietId: z.gebiet_id, titel: z.titel, direktwahl: /(bürgermeister|landrat|stichwahl)/i.test(z.titel) };
			const vergleichbar = Boolean(z.inhalt && waehleGegenwahl(
				{ ags: z.ags, wahltag: ausgewaehlt, name: z.titel, gebietName: z.gebiet_name },
				kandidaten.filter((k) => k.ags === z.ags)
			));
			return z.inhalt ? { ...ref, land: z.land, region: z.region, regionName: z.regionName, vergleichbar, sitze: sitzzahl(ref), stand: parseErgebnis(z.inhalt as never).stand } : { ...ref, land: z.land, region: z.region, regionName: z.regionName, vergleichbar, sitze: sitzzahl(ref), fehler: 'Noch kein Ergebnis archiviert' };
		});
		return { wahltag: ausgewaehlt, wahltermine: termine.wahltermine, zeitpunkt: new Date().toISOString(), eintraege };
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
	/** Fehlt, wenn keine Sitzzahl hinterlegt ist — dann wird nichts gerechnet. */
	verteilung?: Sitzverteilung;
	/** Partei-/Listensummen der gewählten Gebietsebene, unabhängig von Mandaten. */
	stimmverhaeltnis?: Stimmenverhaeltnis;
	direkt?: Direktergebnis;
	/** Von votemanager selbst veröffentlicht, erst im amtlichen Endergebnis. */
	amtlich?: { anzahl: number; gewaehlte: string[][] };
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
		const zeilen = await db()<Array<{ instanz_id: number; ags: string; behoerde: string; titel: string; pfad: string; wahlbereich: string | null; inhalt: unknown; erfasst_am: Date }>>`
			SELECT i.id::int instanz_id, b.kennung ags, b.name behoerde, w.name titel, p.pfad, d.inhalt, d.erfasst_am,
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
		const ref: VertretungRef = { instanzId: gesamtZeile.instanz_id, ags: gesamtZeile.ags, behoerde: gesamtZeile.behoerde, wahlId, gebietId, titel: gesamtZeile.titel, direktwahl: /(bürgermeister|landrat|stichwahl)/i.test(gesamtZeile.titel) };
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

		if (ref.direktwahl) {
			erg.direkt = direktwahl(gesamt.direktBewerber);
			return erg;
		}
		erg.stimmverhaeltnis = stimmenverhaeltnis([
			{ id: gebietId, name: ref.titel, vorschlaege: gesamt.vorschlaege }
		]);

		// Amtliche Sitzzahl schlägt die Vorbelegung, sobald votemanager sie liefert.
		const n = gesamt.amtlicheSitze?.anzahl ?? sitzzahl(ref);
		erg.sitzzahl = n;
		if (!n) {
			erg.warnung = 'Für diese Auswahl ist keine Sitzverteilung verfügbar — angezeigt wird das Stimmenverhältnis.';
			return erg;
		}
		if (!bereicheVollstaendig) {
			erg.warnung = 'Wahlbereiche sind noch nicht vollständig archiviert — es wird noch keine Mandatsverteilung berechnet.';
			return erg;
		}
		erg.verteilung = verteileSitze(bereiche, n);
		return erg;
	});
}
