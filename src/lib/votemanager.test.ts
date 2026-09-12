import { describe, expect, it } from 'vitest';
import { ohneBereich, parseErgebnis } from './votemanager';

describe('Bewerbernamen', () => {
	it('schneidet das Wahlbereichs-Präfix aus Mecklenburg-Vorpommern ab', () => {
		expect(ohneBereich('Wahlbereich Datzetal: Jan-Michael Martin')).toBe('Jan-Michael Martin');
		expect(ohneBereich('Innenstadt; Katharinenviertel; Stadtgebiet Süd: Peter Fink')).toBe('Peter Fink');
		expect(ohneBereich('Dr. Kurt Jeroch')).toBe('Dr. Kurt Jeroch');
	});

	it('gilt in der Tabellenform mit einer Zeile je Wahlvorschlag', () => {
		const erg = parseErgebnis({
			Komponente: {
				tabelle: {
					zeilen: [
						{ label: 'AfD', zahl: '369', sub_zeilen: [{ label: { labelKurz: 'Wahlbereich Datzetal: Jan-Michael Martin' }, zahl: '320' }] }
					]
				}
			}
		} as never);
		expect(erg.vorschlaege[0].kandidaten[0]).toEqual({ name: 'Jan-Michael Martin', stimmen: 320, listenplatz: 1 });
	});
});
