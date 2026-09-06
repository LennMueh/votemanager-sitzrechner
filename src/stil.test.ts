import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Die Tokens in src/app.css tragen nur, wenn niemand an ihnen vorbei einen Wert
 * einsetzt. Ein hart eingesetzter Farbwert nimmt den Dunkelmodus-Anteil von
 * light-dark() nicht mit, und eine hart eingesetzte Schriftgröße driftet aus der
 * Staffel, sobald sich eine Stufe ändert. Beides sieht man der Datei nicht an,
 * nur dem Ergebnis in einem der beiden Modi.
 *
 * Deshalb prüft das hier den Quelltext, nicht das gerenderte Bild: npm run schuss
 * findet Überlauf, aber keinen zweiten Farbsatz.
 */

/** Alle Svelte-Dateien unter src/, Pfad mit Schrägstrich wie im Repository. */
const dateien = readdirSync('src', { recursive: true, encoding: 'utf8' })
	.map((p) => `src/${p}`.replaceAll('\\', '/'))
	.filter((p) => p.endsWith('.svelte'))
	.sort();

/*
 * Zwei benannte Ausnahmen, beide aus einem Grund, den keine Regel kennt:
 *
 * - Stimmverhaeltnis.svelte hält eine Ersatzpalette für Wahlvorschläge, denen
 *   votemanager keine Farbe mitgibt. Das sind Daten, keine Gestaltung: die acht
 *   Werte müssen untereinander unterscheidbar sein, nicht zum Farbschema passen,
 *   und ein Token gäbe es dafür auch nicht sinnvoll.
 * - src/lib/praesentation/ rechnet seine Größen über --skala, die Buehne.svelte
 *   zur Laufzeit zwischen 0,5 und 2,2 stellt. Die Staffel aus app.css ist eine
 *   Staffel für die Seite; auf einem unbekannten Beamer gilt die Messung.
 */
const AUSNAHMEN = {
	farben: ['src/lib/Stimmverhaeltnis.svelte'],
	groessen: ['src/lib/praesentation/']
};

const gilt = (datei: string, liste: string[]) => liste.some((a) => datei.startsWith(a));

const SCHRIFT: [string, number][] = [
	['--schrift-xs', 0.75],
	['--schrift-s', 0.85],
	['--schrift-m', 0.95],
	['--schrift-l', 1.1],
	['--schrift-xl', 1.35]
];

const RADIUS: [string, number][] = [
	['--radius-klein', 9],
	['--radius', 14],
	['--radius-pille', 99]
];

/** Das Token, dessen Wert dem gefundenen am nächsten liegt. */
function naechstes(wert: number, staffel: [string, number][]) {
	return staffel.reduce((a, b) => (Math.abs(b[1] - wert) < Math.abs(a[1] - wert) ? b : a))[0];
}

/** Erste Zahl mit Einheit im Wert; px wird in rem umgerechnet (1rem = 16px). */
function inRem(wert: string) {
	const m = /(-?[\d.]+)\s*(rem|em|px)/.exec(wert);
	if (!m) return null;
	return m[2] === 'px' ? Number(m[1]) / 16 : Number(m[1]);
}

/** Die Fundstellen stehen in der Meldung, nicht nur im Diff: der Reporter kürzt Arrays. */
const meldung = (was: string, funde: string[]) =>
	`${funde.length} ${was}:\n${funde.join('\n')}\n`;

type Fund = { datei: string; zeile: number; text: string; hinweis: string };

function suche(pruefe: (zeile: string, datei: string) => string | null, ausnahmen: string[]) {
	const funde: Fund[] = [];
	for (const datei of dateien) {
		if (gilt(datei, ausnahmen)) continue;
		readFileSync(datei, 'utf8')
			.split('\n')
			.forEach((zeile, i) => {
				const hinweis = pruefe(zeile, datei);
				if (hinweis) funde.push({ datei, zeile: i + 1, text: zeile.trim(), hinweis });
			});
	}
	return funde.map((f) => `${f.datei}:${f.zeile}  ${f.text}\n    → ${f.hinweis}`);
}

describe('Stil', () => {
	it('setzt keine Farbe hart ein', () => {
		// #each und #if fangen sich nicht in [0-9a-f]{3}, weil danach ein Buchstabe
		// steht, der keine Hexziffer ist.
		const funde = suche((zeile) => {
			const farbe = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/.exec(zeile);
			return farbe
				? `Farben kommen aus einem Token in src/app.css (light-dark()); ein Literal hier` +
						` hat nur den Wert für einen der beiden Modi.`
				: null;
		}, AUSNAHMEN.farben);
		expect(funde, meldung('harte Farbwerte', funde)).toEqual([]);
	});

	it('rundet Ecken nur über die Radius-Tokens', () => {
		const funde = suche((zeile) => {
			const m = /border-radius:\s*([^;}]+)/.exec(zeile);
			if (!m) return null;
			const px = /(-?[\d.]+)px/.exec(m[1]);
			return px ? `border-radius ${px[0]} → var(${naechstes(Number(px[1]), RADIUS)})` : null;
		}, []);
		expect(funde, meldung('px-Radien', funde)).toEqual([]);
	});

	it('nimmt Schriftgrößen aus der Staffel, aus clamp() oder aus --skala', () => {
		const funde = suche((zeile) => {
			const m = /font-size:\s*([^;}]+)/.exec(zeile);
			if (!m) return null;
			const wert = m[1].trim();
			const erlaubt =
				/var\(--schrift-/.test(wert) ||
				/^clamp\(/.test(wert) ||
				(/^calc\(/.test(wert) && /var\(--skala\)/.test(wert)) ||
				/^(inherit|1em|100%)$/.test(wert);
			if (erlaubt) return null;
			const rem = inRem(wert);
			return rem === null
				? `font-size ohne Token`
				: `font-size ${wert} → var(${naechstes(rem, SCHRIFT)})`;
		}, AUSNAHMEN.groessen);
		expect(funde, meldung('freie Schriftgrößen', funde)).toEqual([]);
	});
});
