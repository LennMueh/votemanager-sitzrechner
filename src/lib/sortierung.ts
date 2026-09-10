// numeric: „531 Bardowick II" nach „531 Bardowick I", „99 …" vor „531 …".
const text = new Intl.Collator('de', { numeric: true });

/** Die gewählte Spalte einer Tabelle; `null` heißt: Reihenfolge der Vorlage. */
export type Sortierung = { spalte: string; absteigend: boolean } | null;

/** Klick auf einen Spaltenkopf: dieselbe Spalte kehrt um, eine neue beginnt mit `absteigend`. */
export const umschalten = (s: Sortierung, spalte: string, absteigend: boolean): Sortierung =>
	s?.spalte === spalte ? { spalte, absteigend: !s.absteigend } : { spalte, absteigend };

/** Wert für aria-sort am `<th>`: nur die aktive Spalte trägt eine Richtung. */
export const ariaSort = (s: Sortierung, spalte: string) =>
	s?.spalte !== spalte ? 'none' : s.absteigend ? 'descending' : 'ascending';

/**
 * Tabellenzeilen nach einer Spalte sortieren. Fehlende Werte stehen in beiden
 * Richtungen unten — ein „—" gehört nicht an die Spitze einer absteigend
 * sortierten Stimmenspalte. Array.prototype.sort ist stabil: bei Gleichstand
 * bleibt die Reihenfolge der Vorlage.
 */
export function sortiere<T>(
	zeilen: readonly T[],
	wert: (zeile: T) => string | number | undefined,
	absteigend: boolean
): T[] {
	const richtung = absteigend ? -1 : 1;
	return [...zeilen].sort((a, b) => {
		const x = wert(a);
		const y = wert(b);
		if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1;
		return richtung * (typeof x === 'number' && typeof y === 'number' ? x - y : text.compare(String(x), String(y)));
	});
}
