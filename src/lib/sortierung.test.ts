import { describe, expect, it } from 'vitest';
import { ariaSort, sortiere, umschalten } from './sortierung';

describe('sortiere', () => {
	it('sortiert Namen deutsch und Zahlen im Namen numerisch', () => {
		const namen = ['Ölstorf', '531 Bardowick II', 'Oedeme', '531 Bardowick I', '99 Adendorf'];
		expect(sortiere(namen, (n) => n, false)).toEqual([
			'99 Adendorf', '531 Bardowick I', '531 Bardowick II', 'Oedeme', 'Ölstorf'
		]);
	});

	it('lässt fehlende Werte in beiden Richtungen unten', () => {
		const zeilen = [{ w: 2 }, { w: undefined }, { w: 10 }, { w: 1 }];
		expect(sortiere(zeilen, (z) => z.w, false).map((z) => z.w)).toEqual([1, 2, 10, undefined]);
		expect(sortiere(zeilen, (z) => z.w, true).map((z) => z.w)).toEqual([10, 2, 1, undefined]);
	});

	it('behält bei Gleichstand die Reihenfolge der Vorlage', () => {
		const zeilen = [{ p: 'SPD', n: 'A' }, { p: 'CDU', n: 'B' }, { p: 'SPD', n: 'C' }];
		expect(sortiere(zeilen, (z) => z.p, true).map((z) => z.n)).toEqual(['A', 'C', 'B']);
	});

	it('kehrt beim zweiten Klick um und beginnt eine neue Spalte mit ihrer Richtung', () => {
		const erst = umschalten(null, 'stimmen', true);
		expect(erst).toEqual({ spalte: 'stimmen', absteigend: true });
		expect(umschalten(erst, 'stimmen', true)).toEqual({ spalte: 'stimmen', absteigend: false });
		expect(umschalten(erst, 'name', false)).toEqual({ spalte: 'name', absteigend: false });
		expect(ariaSort(erst, 'stimmen')).toBe('descending');
		expect(ariaSort(erst, 'name')).toBe('none');
	});
});
