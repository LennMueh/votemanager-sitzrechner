import { describe, expect, it } from 'vitest';
import { DIAGRAMM_INNENABSTAND, plaetze, punktRadius, ringVerteilung } from './sitzarc';

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

	it('lässt Sitzkreise auch bei kleinen Räten nicht überlappen', () => {
		const bildRadius = 230;
		for (let n = 1; n <= 80; n++) {
			const radius = punktRadius(bildRadius, n);
			const wirksam = bildRadius - radius - DIAGRAMM_INNENABSTAND;
			const punkte = plaetze(n).map((p) => ({
				x: Math.cos(p.winkel) * p.r * wirksam,
				y: Math.sin(p.winkel) * p.r * wirksam
			}));
			for (let i = 0; i < punkte.length; i++) {
				for (let j = i + 1; j < punkte.length; j++) {
					const abstand = Math.hypot(punkte[i].x - punkte[j].x, punkte[i].y - punkte[j].y);
					expect(abstand, `Überlappung bei n=${n}, Plätze ${i}/${j}`).toBeGreaterThan(2 * radius);
				}
			}
		}
	});
});
