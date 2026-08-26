import { describe, expect, it } from 'vitest';
import { gleichesGebiet, normalisiereWahlart, waehleGegenwahl } from './vergleich';

describe('Wahlvergleich', () => {
	it('normalisiert Wahlarten und nimmt die jüngste ältere Gegenwahl', () => {
		expect(normalisiereWahlart('Wahl des Gemeinderates')).toBe('gemeinderat');
		const basis = { wahltag: '20260913', name: 'Wahl des Ortsrates', gebietName: 'Ochtmissen' };
		const alt = { wahltag: '20210912', name: 'Ortsratswahl', gebietName: 'Ochtmissen' };
		expect(waehleGegenwahl(basis, [{ ...alt, wahltag: '20160911' }, alt])).toEqual(alt);
	});

	it('nimmt ersatzweise die früheste neuere Gegenwahl', () => {
		const basis = { wahltag: '20210912', name: 'Gemeinderatswahl', gebietName: 'Oedeme' };
		const ziel = { wahltag: '20260913', name: 'Wahl des Gemeinderates', gebietName: 'Oedeme' };
		expect(waehleGegenwahl(basis, [{ ...ziel, wahltag: '20310914' }, ziel])).toEqual(ziel);
	});

	it('gleicht administrative Namensvarianten ab', () => {
		expect(gleichesGebiet('Landkreises Lüneburg', 'Landkreis Lüneburg')).toBe(true);
		expect(gleichesGebiet('Gemeinde Oldendorf/Luhe', 'Oldendorf/Luhe')).toBe(true);
	});

	it('verwechselt Stichwahlen verschiedener Ämter nicht', () => {
		expect(normalisiereWahlart('Stichwahl einer Landrätin / eines Landrates')).toBe('stichwahl:landrat');
		expect(normalisiereWahlart('Stichwahl des Bürgermeisters')).toBe('stichwahl:burgermeister');
	});
});
