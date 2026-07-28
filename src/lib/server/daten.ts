/**
 * Serverseitige Zusammenführung: votemanager-Daten holen, nach NKWG rechnen,
 * Ergebnis zwischenspeichern.
 *
 * Läuft nur auf dem Server (votemanager sendet kein CORS).
 */

import { verteileSitze, direktwahl, type Sitzverteilung, type Direktergebnis } from '$lib/nkwg';
import {
	holeVertretungen,
	ladeVertretung,
	WAHLTAG,
	type Auszaehlstand,
	type VertretungRef
} from '$lib/votemanager';
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
const FRISCH_MS = 30_000;
const speicher = new Map<string, Eintrag<unknown>>();

async function zwischengespeichert<T>(schluessel: string, laden: () => Promise<T>): Promise<T & { stale?: boolean }> {
	const alt = speicher.get(schluessel) as Eintrag<T> | undefined;
	if (alt && Date.now() - alt.zeit < FRISCH_MS) return alt.wert as T;
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
	sitze?: number;
	stand?: Auszaehlstand;
	fehler?: string;
}

export interface Uebersicht {
	wahltag: string;
	zeitpunkt: string;
	eintraege: UebersichtEintrag[];
	stale?: boolean;
}

export async function holeUebersicht(wahltag = WAHLTAG): Promise<Uebersicht> {
	return zwischengespeichert(`uebersicht:${wahltag}`, async () => {
		const refs = await holeVertretungen(wahltag);
		const eintraege = await Promise.all(
			refs.map(async (ref): Promise<UebersichtEintrag> => {
				try {
					const daten = await ladeVertretung(ref, wahltag, { nurStand: true });
					return { ...ref, sitze: sitzzahl(ref), stand: daten.stand };
				} catch (e) {
					return { ...ref, sitze: sitzzahl(ref), fehler: String(e) };
				}
			})
		);
		return { wahltag, zeitpunkt: new Date().toISOString(), eintraege };
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
	direkt?: Direktergebnis;
	/** Von votemanager selbst veröffentlicht, erst im amtlichen Endergebnis. */
	amtlich?: { anzahl: number; gewaehlte: string[][] };
	warnung?: string;
	zeitpunkt: string;
	stale?: boolean;
}

export async function berechneVertretung(
	ags: string,
	wahlId: number,
	gebietId: string,
	wahltag = WAHLTAG
): Promise<VertretungErgebnis> {
	return zwischengespeichert(`v:${wahltag}:${ags}:${wahlId}:${gebietId}`, async () => {
		const refs = await holeVertretungen(wahltag);
		const ref = refs.find(
			(r) => r.ags === ags && r.wahlId === wahlId && r.gebietId === gebietId
		);
		if (!ref) throw new Error(`Unbekannte Vertretung ${ags}/${wahlId}/${gebietId}`);

		const daten = await ladeVertretung(ref, wahltag);
		const erg: VertretungErgebnis = {
			ref,
			stand: daten.stand,
			kennzahlen: daten.kennzahlen,
			wahlbereiche: daten.bereiche.map((b) => b.name),
			amtlich: daten.amtlicheSitze,
			zeitpunkt: new Date().toISOString()
		};

		if (ref.direktwahl) {
			erg.direkt = direktwahl(daten.direktBewerber);
			return erg;
		}

		// Amtliche Sitzzahl schlägt die Vorbelegung, sobald votemanager sie liefert.
		const n = daten.amtlicheSitze?.anzahl ?? sitzzahl(ref);
		erg.sitzzahl = n;
		if (!n) {
			erg.warnung =
				'Für diese Vertretung ist keine Sitzzahl hinterlegt — es wird nichts gerechnet. Sitzzahl in src/lib/sitzzahlen.json ergänzen.';
			return erg;
		}
		erg.verteilung = verteileSitze(daten.bereiche, n);
		return erg;
	});
}
