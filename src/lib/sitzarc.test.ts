import { describe, expect, it } from 'vitest';
import { plaetze, ringVerteilung } from './sitzarc';

describe('Sitzdiagramm-Geometrie', () => {
	it('hält die Invariante für alle vorkommenden Sitzzahlen', () => {
		// Kleinste Vertretung im Landkreis hat 7 Sitze, größte 58 — mit Reserve.
		for (let n = 1; n <= 80; n++) {
			const ringe = ringVerteilung(n);
			expect(ringe.reduce((s, v) => s + v, 0), `Summe bei n=${n}`).toBe(n);
			expect(Math.min(...ringe), `leerer Ring bei n=${n}`).toBeGreaterThanOrEqual(1);
			expect(plaetze(n).length, `Plätze bei n=${n}`).toBe(n);
		}
	});

	it('ordnet die Plätze von links nach rechts', () => {
		const p = plaetze(30);
		for (let i = 1; i < p.length; i++) {
			expect(p[i].winkel).toBeLessThanOrEqual(p[i - 1].winkel);
		}
	});
});
