/**
 * Dieselbe Prüfung wie alle-vertretungen.test.ts, nur offline: die eingefrorenen
 * amtlichen Endergebnisse aus referenzen/ werden gegen die eigene Rechnung
 * gestellt — Sitze je Partei und die Namen aller Gewählten.
 *
 * Arbeitsteilung (bewusst, siehe scripts/ernte-referenzen.ts):
 *   - dieser Test prüft die Rechenschicht, ohne Netz, in Sekunden.
 *   - alle-vertretungen.test.ts prüft den Parser gegen den echten Feed.
 * Ein Parserfehler friert in die Fixtures mit ein; deshalb braucht es beide.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { verteileSitze, type Wahlbereich } from './nkwg';

const WURZEL = join(import.meta.dirname, '..', '..', 'referenzen');

interface Referenzfall {
	kennung: string;
	quelle: string;
	pruefsumme: string;
	land: string;
	wahltag: string;
	bezeichnung: string;
	sitzeGesamt: number;
	bereiche: Wahlbereich[];
	amtlich: string[][];
}

/** Wie im Netztest: amtliche Liste schreibt „Blankenburg, Jakob", die Tabelle „Jakob Blankenburg". */
function normName(n: string): string {
	return n
		.toLowerCase()
		.replace(/[.,]/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.sort()
		.join(' ');
}

function ladeAlle(): Referenzfall[] {
	const faelle: Referenzfall[] = [];
	for (const land of readdirSync(WURZEL, { withFileTypes: true })) {
		if (!land.isDirectory()) continue;
		for (const datei of readdirSync(join(WURZEL, land.name))) {
			if (!datei.endsWith('.json.gz')) continue;
			faelle.push(JSON.parse(gunzipSync(readFileSync(join(WURZEL, land.name, datei))).toString()));
		}
	}
	return faelle.sort((a, b) => a.kennung.localeCompare(b.kennung));
}

const FAELLE = ladeAlle();

describe('Referenzfälle', () => {
	it('sind vorhanden', () => {
		expect(FAELLE.length).toBeGreaterThan(40);
	});

	it('sind unverändert (Prüfsumme)', () => {
		const abweichend = FAELLE.filter((f) => {
			const kern = { sitzeGesamt: f.sitzeGesamt, bereiche: f.bereiche, amtlich: f.amtlich };
			const ist = 'sha256:' + createHash('sha256').update(JSON.stringify(kern)).digest('hex');
			return ist !== f.pruefsumme;
		}).map((f) => f.kennung);
		expect(abweichend).toEqual([]);
	});

	for (const f of FAELLE) {
		it(`${f.kennung} — ${f.bezeichnung}`, () => {
			const erg = verteileSitze(f.bereiche, f.sitzeGesamt);
			const fehler: string[] = [];

			// Invariante: Gewählte + Unbesetzte === Sitzzahl (§ 36 Abs. 7 NKWG).
			if (erg.sitze.length !== f.sitzeGesamt) {
				fehler.push(`${erg.sitze.length} Sitze berechnet, ${f.sitzeGesamt} erwartet`);
			}

			const amtlichJePartei = new Map<string, number>();
			for (const [partei] of f.amtlich) {
				amtlichJePartei.set(partei, (amtlichJePartei.get(partei) ?? 0) + 1);
			}
			for (const [partei, anzahl] of amtlichJePartei) {
				const berechnet = erg.sitze.filter((s) => s.partei === partei && s.name).length;
				if (berechnet !== anzahl) fehler.push(`${partei}: berechnet ${berechnet}, amtlich ${anzahl}`);
			}

			const amtlich = new Set(f.amtlich.map(([p, name]) => `${p}|${normName(name)}`));
			const berechnet = new Set(
				erg.sitze.filter((s) => s.name).map((s) => `${s.partei}|${normName(s.name!)}`)
			);
			for (const x of berechnet) if (!amtlich.has(x)) fehler.push(`zu viel → ${x}`);
			for (const x of amtlich) if (!berechnet.has(x)) fehler.push(`fehlt → ${x}`);

			expect(fehler).toEqual([]);
		});
	}
});
