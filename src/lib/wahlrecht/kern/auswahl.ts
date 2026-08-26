/**
 * Das gemeinsame Primitiv aller Sitzzuteilungsverfahren.
 *
 * Hare/Niemeyer ist mathematisch *keine* Divisormethode; es als solche zu
 * tarnen wäre eine Lüge im Code. Der echte gemeinsame Nenner liegt eine Ebene
 * tiefer — und zwar genau dort, wo in jedem Landesgesetz der Losentscheid steht:
 *
 *   exakte Zahlen bilden → absteigend sortieren → bei k abschneiden
 *   → Gleichstand an der Schnittkante melden.
 *
 * Das ist 1:1 der Gesetzeswortlaut: „bei gleichen Zahlenbruchteilen" (Quote)
 * bzw. „bei gleichen Höchstzahlen" (Divisor) „entscheidet das Los".
 *
 * Reine Funktionen, kein I/O.
 */

/**
 * Exakter Vergleich zweier Brüche a1/a2 und b1/b2 (Nenner > 0).
 *
 * Kreuzmultiplikation in BigInt statt Gleitkomma: bei knappen Zahlenbruchteilen
 * würde ein Rundungsfehler sonst über ein Mandat entscheiden.
 */
export function vergleicheBruch(a1: bigint, a2: bigint, b1: bigint, b2: bigint): -1 | 0 | 1 {
	const links = a1 * b2;
	const rechts = b1 * a2;
	return links < rechts ? -1 : links > rechts ? 1 : 0;
}

/** Die Stelle, an der das Gesetz das Los entscheiden lässt. Nie selbst aufgelöst. */
export interface Grenzfall<T> {
	/** Alle Beteiligten mit demselben Wert an der Schnittkante — innerhalb und außerhalb. */
	betroffene: T[];
	/** Wie viele Sitze unter ihnen zu verlosen sind. */
	sitze: number;
}

export interface Auswahl<T> {
	gewaehlt: T[];
	/** Gesetzt, wenn an der Zuteilungsgrenze gleiche Werte stehen. */
	grenzfall?: Grenzfall<T>;
}

/**
 * Nimmt die `anzahl` größten Elemente.
 *
 * Bei Gleichstand an der Grenze entscheidet vorläufig die Eingabereihenfolge —
 * das ist Darstellungsstabilität, keine Rechtsfolge. Die Stelle wird über
 * `grenzfall` gemeldet und muss vom Aufrufer sichtbar gemacht werden.
 */
export function nimmGroesste<T>(
	elemente: T[],
	vergleiche: (a: T, b: T) => -1 | 0 | 1,
	anzahl: number
): Auswahl<T> {
	if (anzahl <= 0) return { gewaehlt: [] };

	// Stabil sortieren: bei Gleichstand bleibt die Eingabereihenfolge erhalten.
	const sortiert = elemente
		.map((wert, i) => ({ wert, i }))
		.sort((a, b) => vergleiche(b.wert, a.wert) || a.i - b.i)
		.map((x) => x.wert);

	const gewaehlt = sortiert.slice(0, anzahl);
	if (anzahl >= sortiert.length) return { gewaehlt };

	// Steht an der Schnittkante derselbe Wert wie direkt darunter, ist es ein Losfall.
	if (vergleiche(sortiert[anzahl - 1], sortiert[anzahl]) !== 0) return { gewaehlt };

	const grenzwert = sortiert[anzahl - 1];
	let von = anzahl - 1;
	while (von > 0 && vergleiche(sortiert[von - 1], grenzwert) === 0) von--;
	let bis = anzahl;
	while (bis + 1 < sortiert.length && vergleiche(sortiert[bis + 1], grenzwert) === 0) bis++;

	return {
		gewaehlt,
		grenzfall: { betroffene: sortiert.slice(von, bis + 1), sitze: anzahl - von }
	};
}
