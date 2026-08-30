/**
 * Dieselbe Prüfung wie alle-vertretungen.test.ts, nur offline: die eingefrorenen
 * amtlichen Endergebnisse aus referenzen/ werden gegen die eigene Rechnung
 * gestellt — Sitze je Partei und die Namen aller Gewählten.
 *
 * Arbeitsteilung (bewusst, siehe scripts/ernte-referenzen.ts):
 *   - dieser Test prüft die Rechenschicht, ohne Netz, in Sekunden.
 *   - alle-vertretungen.test.ts prüft den Parser gegen den echten Feed.
 * Ein Parserfehler friert in die Fixtures mit ein; deshalb braucht es beide.
 *
 * Die Fälle sind nach Land gruppiert und laufen durch den jeweiligen
 * Rechtsstand. Damit ist dieser Test zugleich der Beleg dafür, dass für ein Land
 * das richtige Verfahren hinterlegt ist — geraten wird nichts.
 *
 * Namen werden nur dort verglichen, wo sie überhaupt berechenbar sind. Im
 * Saarland und in Nordrhein-Westfalen entscheidet die Reihenfolge auf dem
 * Wahlvorschlag, die votemanager während der Auszählung nicht veröffentlicht;
 * dort bleibt es beim Vergleich der Sitze je Wahlvorschlag.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { rechtsstand } from './wahlrecht';
import quoten from '../../referenzen/quoten.json' with { type: 'json' };
import type { Wahlbereich } from './nkwg';

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
const LAENDER = [...new Set(FAELLE.map((f) => f.land))].sort();

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
});

/** Prüft einen Fall und liefert die Abweichungen — leer heißt getroffen. */
function pruefe(f: Referenzfall, recht: NonNullable<ReturnType<typeof rechtsstand>>): string[] {
	const erg = recht.verteile(f.bereiche, f.sitzeGesamt);
	const fehler: string[] = [];

	// Invariante: Gewählte + Unbesetzte === Sitzzahl.
	if (erg.sitze.length !== f.sitzeGesamt) {
		fehler.push(`${erg.sitze.length} Sitze berechnet, ${f.sitzeGesamt} erwartet`);
	}

	const amtlichJePartei = new Map<string, number>();
	for (const [partei] of f.amtlich) {
		amtlichJePartei.set(partei, (amtlichJePartei.get(partei) ?? 0) + 1);
	}
	for (const [partei, anzahl] of amtlichJePartei) {
		// Unbesetzte Sitze zählen nicht mit: die amtliche Liste führt nur Gewählte.
		// Nicht über `s.name` filtern — im Saarland sind auch besetzte Sitze namenlos.
		const berechnet = erg.sitze.filter((s) => s.partei === partei && !s.unbesetzt).length;
		if (berechnet !== anzahl) fehler.push(`${partei}: berechnet ${berechnet}, amtlich ${anzahl}`);
	}

	// Namen nur, wo sie berechenbar sind — sonst wäre der Vergleich eine Prüfung
	// auf Daten, die der Feed gar nicht hergibt.
	if (erg.sitze.some((s) => s.name)) {
		const amtlich = new Set(f.amtlich.map(([p, name]) => `${p}|${normName(name)}`));
		const berechnet = new Set(
			erg.sitze.filter((s) => s.name).map((s) => `${s.partei}|${normName(s.name!)}`)
		);
		for (const x of berechnet) if (!amtlich.has(x)) fehler.push(`zu viel → ${x}`);
		for (const x of amtlich) if (!berechnet.has(x)) fehler.push(`fehlt → ${x}`);
	}
	return fehler;
}

const QUOTEN = quoten.quoten as Record<string, number>;

for (const land of LAENDER) {
	const recht = rechtsstand(land);
	const faelle = FAELLE.filter((f) => f.land === land);

	describe(`${land} — ${recht?.name ?? 'ohne Rechtsstand'} (${faelle.length} Fälle)`, () => {
		if (!recht) {
			// Kein stiller Rückfall auf das NKWG. Der Fall bleibt sichtbar stehen,
			// bis das Land umgesetzt ist.
			it(`noch kein Rechtsstand hinterlegt — ${faelle.length} Fälle warten`, () => {
				expect(recht).toBeUndefined();
			});
			return;
		}

		if (recht.belegt) {
			// Belegte Länder werden Fall für Fall geprüft. Ein einziger Ausreißer
			// macht den Test rot — das ist der Sinn von `belegt`.
			for (const f of faelle) {
				it(`${f.kennung} — ${f.bezeichnung}`, () => {
					expect(pruefe(f, recht)).toEqual([]);
				});
			}
			return;
		}

		// Noch nicht belegte Länder: die Rechnung trifft einen Teil der amtlichen
		// Ergebnisse. Statt die Suite dauerhaft rot stehen zu lassen, wird die
		// erreichte Quote festgeschrieben. Sie darf nur steigen — jede
		// Verschlechterung ist ein Rückschritt und wird hier sichtbar. Die Lücke
		// zwischen Quote und Gesamtzahl ist die Arbeitsliste des Landes.
		it(`trifft mindestens ${QUOTEN[land] ?? '?'} von ${faelle.length} amtlichen Ergebnissen`, () => {
			const getroffen = faelle.filter((f) => pruefe(f, recht).length === 0).length;
			expect(QUOTEN[land], `Quote für ${land} fehlt in referenzen/quoten.json — erreicht: ${getroffen}`).toBeDefined();
			expect(getroffen).toBeGreaterThanOrEqual(QUOTEN[land]);
		});

		it(`ist noch nicht belegt und sagt das`, () => {
			expect(recht.belegt).toBe(false);
		});
	});
}
