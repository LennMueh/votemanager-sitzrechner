import { describe, expect, it } from 'vitest';
import { trifft, vorwahl } from './katalog';

describe('Katalog-Vorwahl', () => {
	it('behält gültige Werte, wählt eindeutige und verwirft ungültige', () => {
		expect(vorwahl(['NI', 'NW'], 'NI')).toBe('NI');
		expect(vorwahl(['NW'], '')).toBe('NW');
		expect(vorwahl(['NW', 'NI'], 'BY')).toBe('');
	});
});

describe('Suche', () => {
	const zeile = ['Hansestadt Lüneburg', 'Ortsrat Oedeme', 'Oedeme', undefined];

	it('findet unabhängig von der Wortreihenfolge', () => {
		expect(trifft(zeile, 'ortsrat oedeme')).toBe(true);
		expect(trifft(zeile, 'oedeme ortsrat')).toBe(true);
	});

	it('verlangt alle Wörter', () => {
		expect(trifft(zeile, 'oedeme celle')).toBe(false);
	});

	it('sucht auch über Felder, die nur in der Zeile stehen', () => {
		// Der Gebietsname war früher nicht durchsuchbar, obwohl er angezeigt wird.
		expect(trifft(['Rat der Gemeinde', 'Rohrau'], 'rohrau')).toBe(true);
	});

	it('trifft ohne Suchbegriff alles und stolpert nicht über fehlende Felder', () => {
		expect(trifft(zeile, '')).toBe(true);
		expect(trifft(zeile, '   ')).toBe(true);
		expect(trifft([undefined, undefined], 'x')).toBe(false);
	});
});
