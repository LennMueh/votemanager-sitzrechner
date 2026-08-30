/**
 * Sitzverteilung Saarland — offline, ohne Netz.
 *
 * Der erste Test hängt am echten Feed-Ausschnitt: die *flache* Ergebnistabelle,
 * die das Saarland liefert (eine Zeile je Wahlvorschlag, keine sub_zeilen, keine
 * der drei niedersächsischen Suffix-Zeilen). Genau daran ist der Parser einmal
 * gescheitert und hat alle Listen für Direktwahl-Bewerber gehalten.
 */

import { describe, expect, it } from 'vitest';
import { parseErgebnis } from '$lib/votemanager';
import { verteileSitzeSaarland } from './saarland';
import type { Wahlbereich } from '$lib/nkwg';

/**
 * Regionalverband Saarbrücken, Wahl zur Regionalversammlung am 30.08.2026,
 * Zwischenstand 47 von 335 Schnellmeldungen. Gekürzt auf die gelesenen Felder,
 * Zahlen unverändert aus dem Archiv.
 */
const SAARBRUECKEN = {
	Komponente: {
		info: {
			titel: 'Regionalverband Saarbrücken - Regionalverband Saarbrücken',
			hinweis: ['47 von 335 Ergebnissen'],
			tabelle: {
				zeilen: [
					{ zahl: '33.858', label: { labelKurz: 'Wahlberechtigte (in den ausgezählten Bezirken)' } },
					{ zahl: '8.883', label: { labelKurz: 'Wähler/-innen (in den ausgezählten Bezirken)' } },
					{ zahl: '96', label: { labelKurz: 'ungültige Stimmen' } },
					{ zahl: '8.787', label: { labelKurz: 'gültige Stimmen' } }
				]
			}
		},
		sitze: { hinweis: 'Es sind noch nicht alle Schnellmeldungen eingegangen!' },
		tabelle: {
			zeilen: [
				{ zahl: '2.118', color: '#d0000e', label: { labelKurz: 'SPD' } },
				{ zahl: '1.600', color: '#576164', label: { labelKurz: 'CDU' } },
				{ zahl: '2.416', color: '#80cdec', label: { labelKurz: 'AfD' } },
				{ zahl: '980', color: '#33cc00', label: { labelKurz: 'GRÜNE' } },
				{ zahl: '448', color: '#f7bc3d', label: { labelKurz: 'FDP' } },
				{ zahl: '752', color: '#6f003b', label: { labelKurz: 'Die Linke' } },
				{ zahl: '163', color: '#f08301', label: { labelKurz: 'bunt.saar' } },
				{ zahl: '310', color: '#cd386c', label: { labelKurz: 'BSW' } }
			]
		}
	}
};

/** Ein Wahlbereich aus reinen Listenstimmen — so sieht das Saarland aus. */
const bereich = (stimmen: Record<string, number>): Wahlbereich[] => [
	{
		id: 'g',
		name: 'Wahlgebiet',
		vorschlaege: Object.entries(stimmen).map(([partei, listenstimmen]) => ({
			partei,
			listenstimmen,
			kandidaten: []
		}))
	}
];

describe('Parser: flache Listentabelle', () => {
	it('liest die saarländischen Zeilen als Wahlvorschläge, nicht als Bewerber', () => {
		const erg = parseErgebnis(SAARBRUECKEN as never);
		expect(erg.vorschlaege.map((v) => [v.partei, v.listenstimmen])).toEqual([
			['SPD', 2118],
			['CDU', 1600],
			['AfD', 2416],
			['GRÜNE', 980],
			['FDP', 448],
			['Die Linke', 752],
			['bunt.saar', 163],
			['BSW', 310]
		]);
		// Reine Listenwahl: keine Kandidatenstimmen, aber Farbe und Auszählstand.
		expect(erg.vorschlaege.every((v) => v.kandidaten.length === 0)).toBe(true);
		expect(erg.vorschlaege[0].farbe).toBe('#d0000e');
		expect(erg.stand).toMatchObject({ eingegangen: 47, erwartet: 335, vollstaendig: false });
		// Zwischenstand: votemanager nennt noch keine amtliche Sitzzahl.
		expect(erg.amtlicheSitze).toBeUndefined();
	});
});

describe('§ 41 Abs. 1 KWG SL — d’Hondt', () => {
	it('verteilt die 45 Sitze der Regionalversammlung', () => {
		const erg = parseErgebnis(SAARBRUECKEN as never);
		const verteilung = verteileSitzeSaarland(
			[{ id: 'g', name: 'Regionalverband', vorschlaege: erg.vorschlaege }],
			45
		);

		expect(verteilung.gueltigeStimmen).toBe(8787);
		expect(Object.fromEntries(verteilung.parteien.map((p) => [p.partei, p.sitze]))).toEqual({
			AfD: 13,
			SPD: 11,
			CDU: 9,
			GRÜNE: 5,
			'Die Linke': 4,
			FDP: 2,
			BSW: 1,
			'bunt.saar': 0
		});
		// Invariante: genau ein Sitz-Eintrag je Sitz, alle ohne Namen.
		expect(verteilung.sitze).toHaveLength(45);
		expect(verteilung.sitze.every((s) => !s.name && !s.unbesetzt)).toBe(true);
		expect(verteilung.losentscheide).toEqual([]);
	});

	it('rechnet d’Hondt, nicht Hare/Niemeyer', () => {
		// Höchstzahlen: 100 60 50 40 33⅓ … → A 3, B 1, C 1.
		// Hare/Niemeyer gäbe A 2,5→2 (+Rest), B 1,5, C 1 und damit A 2 oder 3 anders.
		const v = verteileSitzeSaarland(bereich({ A: 100, B: 60, C: 40 }), 5);
		expect(Object.fromEntries(v.parteien.map((p) => [p.partei, p.sitze]))).toEqual({
			A: 3,
			B: 1,
			C: 1
		});
	});

	it('meldet den Losentscheid bei gleichen Höchstzahlen, statt ihn aufzulösen', () => {
		const v = verteileSitzeSaarland(bereich({ A: 100, B: 100 }), 1);
		expect(v.losentscheide).toHaveLength(1);
		expect(v.losfaelle[0].rechtsgrundlage).toBe('§ 41 Abs. 1 S. 2 KWG SL');
		expect(v.losfaelle[0].betroffene.sort()).toEqual(['A', 'B']);
		expect(v.sitze).toHaveLength(1);
	});

	it('kennt keine Sperrklausel (seit 20.08.2008 gestrichen)', () => {
		// 2 % bekommen bei 100 Sitzen einen Sitz — mit Fünf-Prozent-Hürde nicht.
		const v = verteileSitzeSaarland(bereich({ Gross: 9800, Klein: 200 }), 100);
		expect(v.parteien.find((p) => p.partei === 'Klein')?.sitze).toBe(2);
	});
});
