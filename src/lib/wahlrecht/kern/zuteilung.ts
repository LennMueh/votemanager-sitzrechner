/**
 * Sitzzuteilung nach Quote (Hare/Niemeyer) oder Divisor (d'Hondt,
 * Sainte-Laguë/Schepers) — beides zurückgeführt auf `nimmGroesste`.
 *
 * Welches Verfahren gilt, ist Landesrecht und steht im jeweiligen Rechtsstand,
 * nicht hier. Hier steht nur die Arithmetik.
 */

import { nimmGroesste, vergleicheBruch, type Grenzfall } from './auswahl';

/** Der j-te Divisor als exakter Bruch (j ab 0n). */
export type Divisorfolge = (j: bigint) => { zaehler: bigint; nenner: bigint };

export type Verfahren =
	| { art: 'quote'; name: string; quote: 'hare' }
	| { art: 'divisor'; name: string; folge: Divisorfolge };

/** § 36 Abs. 2 NKWG und viele andere: Grundsitze plus größte Zahlenbruchteile. */
export const HARE_NIEMEYER: Verfahren = { art: 'quote', name: 'Hare/Niemeyer', quote: 'hare' };

/** Höchstzahlen v/1, v/2, v/3 … — begünstigt die stärkste Liste. */
export const D_HONDT: Verfahren = {
	art: 'divisor',
	name: "d'Hondt",
	folge: (j) => ({ zaehler: j + 1n, nenner: 1n })
};

/** Höchstzahlen v/0,5, v/1,5, v/2,5 … — als Brüche, damit ganzzahlig gerechnet wird. */
export const SAINTE_LAGUE: Verfahren = {
	art: 'divisor',
	name: 'Sainte-Laguë/Schepers',
	folge: (j) => ({ zaehler: 2n * j + 1n, nenner: 2n })
};

export interface Zuteilung<K> {
	sitze: Map<K, number>;
	/** Gesetzt, wenn an der Zuteilungsgrenze gleiche Werte stehen. */
	grenzfall?: Grenzfall<K>;
}

export function zuteilen<K>(stimmen: Map<K, number>, sitze: number, verfahren: Verfahren): Zuteilung<K> {
	const eintraege = [...stimmen.entries()];
	const ergebnis = new Map<K, number>(eintraege.map(([k]) => [k, 0]));
	const gesamt = eintraege.reduce((s, [, v]) => s + v, 0);
	if (gesamt <= 0 || sitze <= 0) return { sitze: ergebnis };

	return verfahren.art === 'quote'
		? nachQuote(eintraege, ergebnis, gesamt, sitze)
		: nachDivisor(eintraege, ergebnis, sitze, verfahren.folge);
}

/**
 * Hare/Niemeyer: zunächst so viele Sitze, wie ganze Zahlen entfallen, dann die
 * Restsitze in der Reihenfolge der höchsten Zahlenbruchteile.
 *
 * Alle Reste haben denselben Nenner (die Gesamtstimmenzahl) — der Vergleich ist
 * deshalb ein reiner BigInt-Vergleich ohne Kreuzmultiplikation.
 */
function nachQuote<K>(
	eintraege: [K, number][],
	ergebnis: Map<K, number>,
	gesamt: number,
	sitze: number
): Zuteilung<K> {
	const G = BigInt(gesamt);
	const S = BigInt(sitze);
	const reste: { k: K; rest: bigint }[] = [];
	let vergeben = 0;

	for (const [k, v] of eintraege) {
		const produkt = BigInt(v) * S;
		const ganze = Number(produkt / G);
		ergebnis.set(k, ganze);
		vergeben += ganze;
		reste.push({ k, rest: produkt % G });
	}

	const auswahl = nimmGroesste(
		reste,
		(a, b) => (a.rest < b.rest ? -1 : a.rest > b.rest ? 1 : 0),
		sitze - vergeben
	);
	for (const r of auswahl.gewaehlt) ergebnis.set(r.k, ergebnis.get(r.k)! + 1);

	return {
		sitze: ergebnis,
		grenzfall: auswahl.grenzfall && {
			betroffene: auswahl.grenzfall.betroffene.map((r) => r.k),
			sitze: auswahl.grenzfall.sitze
		}
	};
}

/**
 * Divisorverfahren: alle Höchstzahlen v · nenner / zaehler bilden und die
 * größten `sitze` davon nehmen. Bei S Sitzen und P Listen sind das P·S Einträge
 * — bei 58 Sitzen und 10 Listen 580, ein Sortieren genügt.
 */
function nachDivisor<K>(
	eintraege: [K, number][],
	ergebnis: Map<K, number>,
	sitze: number,
	folge: Divisorfolge
): Zuteilung<K> {
	const hoechstzahlen: { k: K; zaehler: bigint; nenner: bigint }[] = [];
	for (const [k, v] of eintraege) {
		if (v <= 0) continue;
		for (let j = 0n; j < BigInt(sitze); j++) {
			const d = folge(j);
			// Höchstzahl = v / (zaehler/nenner) = (v · nenner) / zaehler
			hoechstzahlen.push({ k, zaehler: BigInt(v) * d.nenner, nenner: d.zaehler });
		}
	}

	const auswahl = nimmGroesste(
		hoechstzahlen,
		(a, b) => vergleicheBruch(a.zaehler, a.nenner, b.zaehler, b.nenner),
		sitze
	);
	for (const h of auswahl.gewaehlt) ergebnis.set(h.k, ergebnis.get(h.k)! + 1);

	return {
		sitze: ergebnis,
		grenzfall: auswahl.grenzfall && {
			betroffene: auswahl.grenzfall.betroffene.map((h) => h.k),
			sitze: auswahl.grenzfall.sitze
		}
	};
}
