/**
 * Geometrie des Monatskalenders.
 *
 * Eigene Datei aus demselben Grund wie sitzarc.ts: die Rasterberechnung hat
 * Invarianten (immer 42 Felder, Woche beginnt montags, nur Wahltage anwählbar),
 * die still kaputtgehen könnten. Reine Funktionen, kein DOM.
 *
 * Gerechnet wird durchweg in UTC. Mit Ortszeit fällt der 1. eines Monats bei
 * Sommerzeitwechseln gelegentlich auf den Vortag — der Kalender zeigte dann
 * einen Tag verschoben an.
 */

/** Immer sechs Wochen: sonst springt das Raster beim Monatswechsel in der Höhe. */
const WOCHEN = 6;

export interface Kalendertag {
	/** YYYYMMDD, wie überall sonst im Projekt. */
	datum: string;
	tag: number;
	/** Gehört der Tag zum angezeigten Monat oder zur Füllung davor/danach? */
	imMonat: boolean;
	/** Zahl der Wahlen an diesem Tag; 0 heißt: nicht anwählbar. */
	wahlen: number;
}

export const schluessel = (d: Date): string =>
	`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** Wochentag mit Montag = 0. `getUTCDay()` zählt ab Sonntag. */
const montagsIndex = (d: Date): number => (d.getUTCDay() + 6) % 7;

/**
 * Das Raster eines Monats, aufgefüllt mit den Randtagen der Nachbarmonate.
 *
 * `monat` ist 1-basiert — der Kalender spricht mit Menschen, nicht mit `Date`.
 */
export function monatsraster(jahr: number, monat: number, wahlen: Map<string, number>): Kalendertag[] {
	const erster = new Date(Date.UTC(jahr, monat - 1, 1));
	const start = new Date(erster);
	start.setUTCDate(1 - montagsIndex(erster));

	return Array.from({ length: WOCHEN * 7 }, (_, i) => {
		const tag = new Date(start);
		tag.setUTCDate(start.getUTCDate() + i);
		const datum = schluessel(tag);
		return {
			datum,
			tag: tag.getUTCDate(),
			imMonat: tag.getUTCMonth() === monat - 1 && tag.getUTCFullYear() === jahr,
			wahlen: wahlen.get(datum) ?? 0
		};
	});
}

/** Monat verschieben, über Jahresgrenzen hinweg. */
export function verschiebeMonat(jahr: number, monat: number, um: number): { jahr: number; monat: number } {
	const roh = jahr * 12 + (monat - 1) + um;
	return { jahr: Math.floor(roh / 12), monat: (roh % 12) + 1 };
}

/**
 * Nächster Wahltag ab `von` in der gewünschten Richtung.
 *
 * `von` selbst zählt nicht mit: die Knöpfe sollen weiterspringen, nicht stehen
 * bleiben. Gibt es keinen weiteren, kommt `undefined` — der Knopf wird dann
 * abgeschaltet, statt ins Leere zu führen.
 */
export function naechsterWahltag(
	termine: readonly string[],
	von: string,
	richtung: 1 | -1
): string | undefined {
	const sortiert = [...termine].sort();
	return richtung === 1
		? sortiert.find((t) => t > von)
		: sortiert.filter((t) => t < von).at(-1);
}

/** „20260913" → „13.09.2026". */
export function alsText(datum: string): string {
	return datum.length === 8 ? `${datum.slice(6, 8)}.${datum.slice(4, 6)}.${datum.slice(0, 4)}` : datum;
}
