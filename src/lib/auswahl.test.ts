import { describe, expect, it } from 'vitest';
import { vertretungPfad } from './auswahl';

describe('Wahlauswahl-Schlüssel', () => {
	it('unterstützt Instanzen und alte AGS-Lesezeichen', () => {
		expect(vertretungPfad('i42:219:ebene_3_id_436')).toBe('/api/vertretung?wahl=219&gebiet=ebene_3_id_436&instanz=42');
		expect(vertretungPfad('03355001:219:ebene_3_id_436', '20210912')).toBe('/api/vertretung?wahl=219&gebiet=ebene_3_id_436&ags=03355001&wahltag=20210912');
	});
});
