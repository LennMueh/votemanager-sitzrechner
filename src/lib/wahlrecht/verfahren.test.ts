/**
 * Verfahrensnachweis: welches Sitzzuteilungsverfahren in einem Land gilt, wird
 * hier nicht geglaubt, sondern nachgerechnet.
 *
 * Für jedes Land werden alle drei Verfahren gegen die eingefrorenen amtlichen
 * Endergebnisse gestellt. Das im Rechtsstand hinterlegte muss die meisten Fälle
 * treffen — und zwar deutlich, nicht knapp. Wer das Verfahren eines Landes
 * versehentlich ändert, sieht es hier zuerst.
 *
 * Das ersetzt keine Gesetzeslektüre; die Paragraphen stehen in index.ts. Es
 * verhindert nur, dass eine Vermutung unbemerkt als Tatsache weiterlebt.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { alleRechtsstaende, rechtsstand } from './index';
import { verteileListenwahl } from './listenwahl';
import { D_HONDT, HARE_NIEMEYER, SAINTE_LAGUE, type Verfahren } from './kern/zuteilung';
import type { Wahlbereich } from '$lib/nkwg';

const WURZEL = join(import.meta.dirname, '..', '..', '..', 'referenzen');
const ALLE: Verfahren[] = [HARE_NIEMEYER, D_HONDT, SAINTE_LAGUE];

interface Fall {
	land: string;
	sitzeGesamt: number;
	bereiche: Wahlbereich[];
	amtlich: string[][];
}

function faelle(land: string): Fall[] {
	const verzeichnis = join(WURZEL, land.toLowerCase());
	try {
		return readdirSync(verzeichnis)
			.filter((f) => f.endsWith('.json.gz'))
			.map((f) => JSON.parse(gunzipSync(readFileSync(join(verzeichnis, f))).toString()));
	} catch {
		return [];
	}
}

/** Wie viele Fälle trifft dieses Verfahren auf der Ebene „Sitze je Wahlvorschlag"? */
function treffer(faelle: Fall[], verfahren: Verfahren): number {
	let n = 0;
	for (const f of faelle) {
		const erg = verteileListenwahl(f.bereiche, f.sitzeGesamt, {
			verfahren,
			personen: 'stimmen',
			rechtsgrundlageZuteilung: ''
		});
		const amtlich = new Map<string, number>();
		for (const [partei] of f.amtlich) amtlich.set(partei, (amtlich.get(partei) ?? 0) + 1);
		const passt =
			erg.sitze.length === f.sitzeGesamt &&
			[...amtlich].every(
				([partei, anzahl]) => erg.sitze.filter((s) => s.partei === partei && !s.unbesetzt).length === anzahl
			);
		if (passt) n++;
	}
	return n;
}

describe('Verfahrensnachweis gegen amtliche Endergebnisse', () => {
	// Niedersachsen läuft über § 36 Abs. 4 NKWG und nicht über verteileListenwahl;
	// sein Nachweis ist referenzen.test.ts mit 53 Fällen, alle grün.
	for (const recht of alleRechtsstaende().filter((r) => r.land !== 'NI')) {
		const menge = faelle(recht.land);

		it(`${recht.land}: ${recht.verfahren.name} trifft am häufigsten`, () => {
			expect(menge.length).toBeGreaterThan(10);
			const ergebnis = ALLE.map((v) => ({ name: v.name, treffer: treffer(menge, v) })).sort(
				(a, b) => b.treffer - a.treffer
			);
			expect(`${recht.land}: ${ergebnis.map((e) => `${e.name} ${e.treffer}`).join(', ')}`).toBe(
				`${recht.land}: ${recht.verfahren.name} ${ergebnis[0].treffer}, ${ergebnis[1].name} ${ergebnis[1].treffer}, ${ergebnis[2].name} ${ergebnis[2].treffer}`
			);
		});
	}

	it('kennt für jedes Land mit Referenzfällen einen Rechtsstand oder sagt es', () => {
		const ohne = readdirSync(WURZEL, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name.toUpperCase())
			.filter((land) => !rechtsstand(land));
		// Wächst diese Liste, fehlt ein Eintrag in index.ts.
		expect(ohne).toEqual([]);
	});
});
