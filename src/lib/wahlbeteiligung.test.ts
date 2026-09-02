import { describe, it, expect } from 'vitest';
import { wahlbeteiligung } from './votemanager';

// Die Labels stammen aus dem Archiv: Stichproben über elf Länder, 783.700
// Dokumente. Eine Zeile „Wahlbeteiligung" kommt darin nicht ein einziges Mal
// vor — deshalb wird gerechnet, und deshalb muss die Zuordnung der Freitext-
// Labels geprüft sein.

const prozent = (k: Record<string, number>) => {
	const b = wahlbeteiligung(k);
	return b && Math.round(b.anteil * 1000) / 10;
};

describe('wahlbeteiligung', () => {
	it.each([
		['NI', { Wahlberechtigte: 1000, 'Wählerinnen/Wähler': 604 }, 60.4],
		['NI', { Wahlberechtigte: 1000, 'Wähler/-innen': 500 }, 50],
		['BY', { Wahlberechtigte: 800, Wähler: 400 }, 50],
		['SL', { Wahlberechtigte: 400, 'Wähler/innen': 100 }, 25],
		['SH', { Wahlberechtigte: 250, 'Wählerinnen und Wähler': 200 }, 80],
		['SH', { Stimmberechtigte: 500, 'Wähler/-innen': 125 }, 25],
		['HE', { Stimmberechtigte: 200, Abstimmende: 50 }, 25],
		['MV', { Abstimmungsberechtigte: 640, Abstimmende: 160 }, 25]
	])('%s: %o', (_land, kennzahlen, erwartet) => {
		expect(prozent(kennzahlen)).toBe(erwartet);
	});

	// Frankfurt am Main, Kommunalwahl 14.03.2021: der Feed führt beide
	// Bezugsgrößen und schreibt selbst 48,8 % daneben — bezogen auf die
	// ausgezählten Bezirke, nicht auf die 40.481 insgesamt (das wären 47,4 %).
	it('nimmt bei zwei Bezugsgrößen die ausgezählten Bezirke', () => {
		const frankfurt = {
			'Wahlberechtigte (insgesamt)': 40481,
			'Wahlberechtigte (in den ausgezählten Bezirken)': 39329,
			'Wähler/-innen (in den ausgezählten Bezirken)': 19182,
			'Ungültige Stimmzettel': 496
		};
		expect(prozent(frankfurt)).toBe(48.8);
		expect(wahlbeteiligung(frankfurt)?.berechtigte).toBe(39329);
	});

	// Umlaute nicht falten: sonst greift die Wähler-Familie auf „Wahlberechtigte".
	it('hält Wahlberechtigte aus der Wählerfamilie heraus', () => {
		expect(wahlbeteiligung({ Wahlberechtigte: 1000, 'gültige Stimmen': 500 })).toBeUndefined();
	});

	it.each([
		['nur Stimmen', { 'gültige Stimmen': 500, 'ungültige Stimmen': 8 }],
		['Wähler ohne Berechtigte', { 'Wähler/-innen': 500, 'gültige Stimmen': 490 }],
		['Berechtigte bei null', { Wahlberechtigte: 0, 'Wähler/-innen': 0 }],
		['leer', {}]
	])('rechnet nicht: %s', (_fall, kennzahlen) => {
		expect(wahlbeteiligung(kennzahlen)).toBeUndefined();
	});
});
