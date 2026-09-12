import { describe, expect, it } from 'vitest';
import { gehoertZumGebiet, ohneBereich, parseErgebnis } from './votemanager';

/** Ein Ergebnisdokument mit Bewerbern und Wahlbezirks-Verlinkung. */
const dok = (bezirke: string[], bewerber: string[]) =>
	({
		Komponente: {
			tabelle: { zeilen: [{ label: 'SPD', zahl: '1', sub_zeilen: bewerber.map((b) => ({ label: { labelKurz: b }, zahl: '1' })) }] },
			gebietsverlinkung: bezirke.length ? [{ titel: 'Wahlbezirke', gebietslinks: bezirke.map((id) => ({ id, type: 'ergebnis', title: id })) }] : []
		}
	}) as never;

describe('Wahlbereiche eines Wahlgebiets', () => {
	it('verwirft den Stadtrats-Wahlbereich, den sich ein Ortsrat über die Wahl-ID teilt', () => {
		expect(gehoertZumGebiet(dok(['b1', 'b2'], ['Anna', 'Bert']), dok(['b1', 'b2', 'b7'], ['Anna', 'Carl']))).toBe(false);
	});

	it('behält den eigenen Wahlbereich', () => {
		expect(gehoertZumGebiet(dok(['b1', 'b2', 'b3'], ['Anna', 'Bert', 'Carl']), dok(['b1'], ['Anna']))).toBe(true);
	});

	it('behält ihn, solange nur eines der beiden Zeichen „fremd" sagt', () => {
		// Kreistag: keine Bezirksverlinkung — nie verwerfen.
		expect(gehoertZumGebiet(dok([], ['Anna']), dok([], ['Zoe']))).toBe(true);
		expect(gehoertZumGebiet(dok(['b1'], ['Anna', 'Bert']), dok(['b9'], ['Anna']))).toBe(true);
		// Vor der Auszählung fehlen die Bewerber.
		expect(gehoertZumGebiet(dok(['b1'], []), dok(['b9'], []))).toBe(true);
	});
});

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
