import { describe, expect, it } from 'vitest';
import { D_HONDT, HARE_NIEMEYER, SAINTE_LAGUE, zuteilen } from './zuteilung';

const verfahren = [HARE_NIEMEYER, D_HONDT, SAINTE_LAGUE];

describe('Sitzzuteilung', () => {
	it('trennt d’Hondt von Hare/Niemeyer und Sainte-Laguë', () => {
		const stimmen = new Map([['A', 53], ['B', 24], ['C', 23]]);
		expect([...zuteilen(stimmen, 3, D_HONDT).sitze.values()]).toEqual([2, 1, 0]);
		expect([...zuteilen(stimmen, 3, SAINTE_LAGUE).sitze.values()]).toEqual([1, 1, 1]);
		expect([...zuteilen(stimmen, 3, HARE_NIEMEYER).sitze.values()]).toEqual([1, 1, 1]);
	});

	it.each(verfahren)('meldet den Losfall bei $name', (v) => {
		const erg = zuteilen(new Map([['A', 50], ['B', 50]]), 1, v);
		expect(erg.grenzfall).toEqual({ betroffene: ['A', 'B'], sitze: 1 });
	});

	it.each(verfahren)('erfasst den ganzen Gleichstand bei $name', (v) => {
		const erg = zuteilen(new Map([['A', 45], ['B', 20], ['C', 20], ['D', 20]]), 3, v);
		expect(erg.grenzfall?.betroffene).toEqual(['B', 'C', 'D']);
	});

	it.each(verfahren)('hält Invarianten bei $name', (v) => {
		const erg = zuteilen(new Map([['A', 53], ['B', 24], ['C', 23]]), 3, v);
		expect([...erg.sitze.values()].reduce((summe, sitze) => summe + sitze, 0)).toBe(3);
		expect(zuteilen(new Map([['A', 1]]), 0, v).grenzfall).toBeUndefined();
		expect([...zuteilen(new Map([['A', 0]]), 3, v).sitze.values()]).toEqual([0]);
	});
});
