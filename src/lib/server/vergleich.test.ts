import { describe, expect, it } from 'vitest';
import { gleichesGebiet, normalisiereWahlart, vertretungsSchluessel, waehleGegenwahl } from './vergleich';

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

describe('stabiler Vertretungsschlüssel', () => {
	it('überlebt die Umbenennungen zwischen zwei Wahlzyklen', () => {
		// Genau diese Paare haben die Sitzzahlen-Tabelle unbrauchbar gemacht: über
		// den rohen Titel passten von 56 Einträgen noch fünf auf die Wahl 2026.
		const gleich = (a: [string, string, string?], b: [string, string, string?]) =>
			expect(vertretungsSchluessel(...a)).toBe(vertretungsSchluessel(...b));

		gleich(
			['03355000', 'Kreiswahl - Landkreises Lüneburg'],
			['03355000', 'Kreiswahl - Landkreis Lüneburg', 'Landkreis Lüneburg']
		);
		gleich(
			['03355001', 'Gemeindewahl - Gemeinde Adendorf'],
			['03355001', 'Wahl des Gemeinderates - Gemeinde Adendorf', 'Gemeinde Adendorf']
		);
		gleich(
			['03355022', 'Wahl des Ortsrates - Oedeme'],
			['03355022', 'Wahl des Ortsrates Oedeme - Oedeme', 'Oedeme']
		);
	});

	it('hält verschiedene Vertretungen derselben Behörde auseinander', () => {
		const ortsrat = (ort: string) => vertretungsSchluessel('03355022', `Wahl des Ortsrates ${ort} - ${ort}`, ort);
		expect(ortsrat('Oedeme')).not.toBe(ortsrat('Ochtmissen'));
		// Samtgemeinden führen mehrere Gemeinderatswahlen unter einer Kennung.
		const rat = (ort: string) => vertretungsSchluessel('033555404', `Wahl des Gemeinderates - Gemeinde ${ort} - Gemeinde ${ort}`, `Gemeinde ${ort}`);
		expect(rat('Reppenstedt')).not.toBe(rat('Westergellersen'));
		// Und die Kreiswahl ist nicht die Gemeindewahl.
		expect(vertretungsSchluessel('03355001', 'Kreiswahl - Gemeinde Adendorf', 'Gemeinde Adendorf'))
			.not.toBe(vertretungsSchluessel('03355001', 'Wahl des Gemeinderates - Gemeinde Adendorf', 'Gemeinde Adendorf'));
	});
});
