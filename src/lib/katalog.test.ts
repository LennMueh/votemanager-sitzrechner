import { describe, expect, it } from 'vitest';
import { vorwahl } from './katalog';

describe('Katalog-Vorwahl', () => {
	it('behält gültige Werte, wählt eindeutige und verwirft ungültige', () => {
		expect(vorwahl(['NI', 'NW'], 'NI')).toBe('NI');
		expect(vorwahl(['NW'], '')).toBe('NW');
		expect(vorwahl(['NW', 'NI'], 'BY')).toBe('');
	});
});
