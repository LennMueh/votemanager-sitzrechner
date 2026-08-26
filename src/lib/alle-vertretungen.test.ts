/**
 * Der stärkste verfügbare Test: für *jede* Vertretung im Landkreis Lüneburg
 * wird die eigene Berechnung gegen das amtlich veröffentlichte Ergebnis 2021
 * gestellt — Sitze je Partei und die Namen aller Gewählten.
 *
 * Läuft gegen das echte Netz und dauert entsprechend.
 */

import { describe, expect, it } from 'vitest';
import { verteileSitze } from './nkwg';
import { holeVertretungen, ladeVertretung } from './votemanager';

const WAHLTAG_2021 = '20210912';

function normName(n: string): string {
	return n
		.toLowerCase()
		.replace(/[.,]/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.sort()
		.join(' ');
}

describe('Alle Vertretungen im Landkreis Lüneburg 2021', () => {
	it('berechnet jede Vertretung amtlich exakt', async () => {
		const refs = (await holeVertretungen(WAHLTAG_2021)).filter((r) => !r.direktwahl);
		expect(refs.length).toBeGreaterThan(40);
		expect(refs.filter((r) => /ortsrat/i.test(r.titel)).map((r) => r.titel).sort()).toEqual([
			'Wahl des Ortsrates - Ochtmissen',
			'Wahl des Ortsrates - Oedeme'
		]);

		const fehler: string[] = [];
		let geprueft = 0;

		for (const ref of refs) {
			const daten = await ladeVertretung(ref, WAHLTAG_2021);
			// Ohne amtliche Sitzverteilung gibt es nichts zu vergleichen
			// (z. B. Ansichten, die keine eigene Vertretung sind).
			if (!daten.amtlicheSitze?.anzahl) continue;
			geprueft++;

			const kennung = `${ref.behoerde} / ${ref.titel}`;
			const erg = verteileSitze(daten.bereiche, daten.amtlicheSitze.anzahl);

			// Invariante: besetzte plus unbesetzte Sitze ergeben die Sitzzahl.
			if (erg.sitze.length !== daten.amtlicheSitze.anzahl) {
				fehler.push(
					`${kennung}: ${erg.sitze.length} Sitze berechnet, ${daten.amtlicheSitze.anzahl} erwartet`
				);
				continue;
			}

			// Sitze je Partei
			const amtlichJePartei = new Map<string, number>();
			for (const [partei] of daten.amtlicheSitze.gewaehlte) {
				amtlichJePartei.set(partei, (amtlichJePartei.get(partei) ?? 0) + 1);
			}
			for (const [partei, anzahl] of amtlichJePartei) {
				const berechnet = erg.sitze.filter((s) => s.partei === partei && s.name).length;
				if (berechnet !== anzahl) {
					fehler.push(`${kennung}: ${partei} berechnet ${berechnet}, amtlich ${anzahl}`);
				}
			}

			// Gewählte Personen
			const amtlich = new Set(
				daten.amtlicheSitze.gewaehlte.map(([p, name]) => `${p}|${normName(name)}`)
			);
			const berechnet = new Set(
				erg.sitze.filter((s) => s.name).map((s) => `${s.partei}|${normName(s.name!)}`)
			);
			for (const x of berechnet) if (!amtlich.has(x)) fehler.push(`${kennung}: zu viel → ${x}`);
			for (const x of amtlich) if (!berechnet.has(x)) fehler.push(`${kennung}: fehlt → ${x}`);
		}

		console.log(`  ${geprueft} Vertretungen geprüft`);
		expect(fehler).toEqual([]);
		expect(geprueft).toBeGreaterThan(40);
	}, 600_000);
});
