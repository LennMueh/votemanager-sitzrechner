import { describe, expect, it } from 'vitest';
import {
	stimmenverhaeltnis,
	hareNiemeyer,
	verteileSitze,
	direktwahl,
	type Wahlbereich
} from './nkwg';
import { ladeVertretung, type VertretungRef } from './votemanager';

const WAHLTAG_2021 = '20210912';

/**
 * Die amtliche Liste schreibt „Blankenburg, Jakob", die Ergebnistabelle
 * „Jakob Blankenburg". Für den Vergleich werden die Namensbestandteile
 * normalisiert und sortiert.
 */
function normName(n: string): string {
	return n
		.toLowerCase()
		.replace(/[.,]/g, ' ')
		.split(/\s+/)
		.filter(Boolean)
		.sort()
		.join(' ');
}

async function lade(ref: Omit<VertretungRef, 'behoerde'>) {
	return ladeVertretung({ behoerde: '', ...ref } as VertretungRef, WAHLTAG_2021);
}

// ---------------------------------------------------------------------------

describe('hareNiemeyer', () => {
	it('verteilt ganze Zahlen und Restsitze nach höchsten Bruchteilen', () => {
		const { zuteilung } = hareNiemeyer(
			new Map([
				['A', 720],
				['B', 480],
				['C', 300]
			]),
			10
		);
		// 720/1500*10 = 4,8 | 480/1500*10 = 3,2 | 300/1500*10 = 2,0
		expect(zuteilung.get('A')).toBe(5);
		expect(zuteilung.get('B')).toBe(3);
		expect(zuteilung.get('C')).toBe(2);
	});

	it('meldet Losentscheid bei gleichen Zahlenbruchteilen', () => {
		const { losentscheid } = hareNiemeyer(
			new Map([
				['A', 100],
				['B', 100],
				['C', 100]
			]),
			4
		);
		expect(losentscheid).toBe(true);
	});

	it('verteilt keine Sitze ohne Stimmen', () => {
		const { zuteilung } = hareNiemeyer(new Map([['A', 0]]), 5);
		expect(zuteilung.get('A')).toBe(0);
	});
});

describe('stimmenverhaeltnis', () => {
	it('summiert Listen- und Bewerberstimmen aller Wahlbereiche einschließlich Nullwerten', () => {
		const erg = stimmenverhaeltnis([
			{
				id: '1',
				name: 'Nord',
				vorschlaege: [
					{ partei: 'A', listenstimmen: 10, kandidaten: [{ name: 'A1', stimmen: 20, listenplatz: 1 }] },
					{ partei: 'C', listenstimmen: 0, kandidaten: [] }
				]
			},
			{
				id: '2',
				name: 'Süd',
				vorschlaege: [
					{ partei: 'B', listenstimmen: 20, kandidaten: [] },
					{ partei: 'A', listenstimmen: 10, kandidaten: [{ name: 'A2', stimmen: 10, listenplatz: 1 }] }
				]
			}
		]);

		expect(erg.stimmenGesamt).toBe(70);
		expect(erg.parteien.map(({ partei, stimmen, prozent }) => ({ partei, stimmen, prozent }))).toEqual([
			{ partei: 'A', stimmen: 50, prozent: (50 / 70) * 100 },
			{ partei: 'B', stimmen: 20, prozent: (20 / 70) * 100 },
			{ partei: 'C', stimmen: 0, prozent: 0 }
		]);
	});
});

describe('direktwahl (§ 45g)', () => {
	it('erkennt absolute Mehrheit', () => {
		const e = direktwahl([
			{ name: 'A', stimmen: 600 },
			{ name: 'B', stimmen: 400 }
		]);
		expect(e.gewaehlt?.name).toBe('A');
		expect(e.stichwahl).toBeUndefined();
	});

	it('setzt sonst eine Stichwahl der zwei Bestplatzierten an', () => {
		const e = direktwahl([
			{ name: 'A', stimmen: 400 },
			{ name: 'B', stimmen: 350 },
			{ name: 'C', stimmen: 250 }
		]);
		expect(e.gewaehlt).toBeUndefined();
		expect(e.stichwahl?.map((b) => b.name)).toEqual(['A', 'B']);
	});

	it('genau die Hälfte reicht nicht', () => {
		const e = direktwahl([
			{ name: 'A', stimmen: 500 },
			{ name: 'B', stimmen: 500 }
		]);
		expect(e.gewaehlt).toBeUndefined();
	});
});

describe('Erschöpfungskaskade', () => {
	it('lässt Sitze unbesetzt, wenn die Liste zu kurz ist (§ 36 Abs. 7)', () => {
		const bereiche: Wahlbereich[] = [
			{
				id: 'w1',
				name: 'W1',
				vorschlaege: [
					{
						partei: 'KURZ',
						listenstimmen: 0,
						kandidaten: [{ name: 'Einzige Person', stimmen: 900, listenplatz: 1 }]
					},
					{
						partei: 'LANG',
						listenstimmen: 10,
						kandidaten: [
							{ name: 'A', stimmen: 30, listenplatz: 1 },
							{ name: 'B', stimmen: 20, listenplatz: 2 }
						]
					}
				]
			}
		];
		const erg = verteileSitze(bereiche, 5);
		const unbesetzt = erg.sitze.filter((s) => s.unbesetzt);
		expect(unbesetzt.length).toBeGreaterThan(0);
		expect(unbesetzt[0].partei).toBe('KURZ');
		// Invariante: jeder Sitz ist entweder besetzt oder ausgewiesen unbesetzt.
		expect(erg.sitze.length).toBe(5);
	});

	it('überträgt überzählige Sitze in andere Wahlbereiche (§ 37 Abs. 5)', () => {
		const bereiche: Wahlbereich[] = [
			{
				id: 'w1',
				name: 'Wahlbereich 1',
				vorschlaege: [
					{
						partei: 'P',
						listenstimmen: 0,
						kandidaten: [{ name: 'Nur Eine', stimmen: 1000, listenplatz: 1 }]
					}
				]
			},
			{
				id: 'w2',
				name: 'Wahlbereich 2',
				vorschlaege: [
					{
						partei: 'P',
						listenstimmen: 0,
						kandidaten: [
							{ name: 'Zwei A', stimmen: 40, listenplatz: 1 },
							{ name: 'Zwei B', stimmen: 30, listenplatz: 2 },
							{ name: 'Zwei C', stimmen: 20, listenplatz: 3 }
						]
					}
				]
			}
		];
		const erg = verteileSitze(bereiche, 4);
		// Wahlbereich 1 kann nur eine Person stellen, der Rest muss übergehen.
		expect(erg.sitze.filter((s) => s.art === 'uebertrag').length).toBeGreaterThan(0);
		expect(erg.sitze.filter((s) => s.name).length).toBe(4);
	});
});

// ---------------------------------------------------------------------------
// Golden Tests gegen die amtlichen Ergebnisse von 2021
// ---------------------------------------------------------------------------

describe('Kreistag Landkreis Lüneburg 2021', () => {
	it('reproduziert Sitzverteilung und gewählte Personen amtlich exakt', async () => {
		const daten = await lade({
			ags: '03355000',
			wahlId: 219,
			gebietId: 'ebene_1_id_435',
			titel: 'Kreiswahl',
			direktwahl: false
		});

		expect(daten.bereiche.length).toBe(5); // fünf Kreiswahlbereiche → § 37
		expect(daten.amtlicheSitze?.anzahl).toBe(58);

		const erg = verteileSitze(daten.bereiche, daten.amtlicheSitze!.anzahl);
		expect(erg.sitze.length).toBe(58);

		// Sitze je Partei
		const amtlichJePartei = new Map<string, number>();
		for (const [partei] of daten.amtlicheSitze!.gewaehlte) {
			amtlichJePartei.set(partei, (amtlichJePartei.get(partei) ?? 0) + 1);
		}
		for (const [partei, anzahl] of amtlichJePartei) {
			const berechnet = erg.parteien.find((p) => p.partei === partei)?.sitze ?? 0;
			expect(`${partei}=${berechnet}`).toBe(`${partei}=${anzahl}`);
		}

		// Gewählte Personen als Menge (Partei + Name)
		const amtlich = new Set(
			daten.amtlicheSitze!.gewaehlte.map(([p, name]) => `${p}|${normName(name)}`)
		);
		const berechnet = new Set(erg.sitze.filter((s) => s.name).map((s) => `${s.partei}|${normName(s.name!)}`));
		expect([...berechnet].filter((x) => !amtlich.has(x))).toEqual([]);
		expect([...amtlich].filter((x) => !berechnet.has(x))).toEqual([]);
	});
});

describe('Ortsrat Oedeme 2021', () => {
	it('weist den nicht besetzbaren Sitz als unbesetzt aus (§ 36 Abs. 7)', async () => {
		const daten = await lade({
			ags: '03355022',
			wahlId: 225,
			gebietId: 'ebene_8_id_1935',
			titel: 'Wahl des Ortsrates - Oedeme',
			direktwahl: false
		});
		expect(daten.amtlicheSitze?.anzahl).toBe(7);
		// Amtlich sind nur sechs Personen gewählt — ein Sitz bleibt unbesetzt.
		expect(daten.amtlicheSitze?.gewaehlte.length).toBe(6);

		const erg = verteileSitze(daten.bereiche, 7);
		expect(erg.sitze.filter((s) => s.name).length).toBe(6);
		expect(erg.sitze.filter((s) => s.unbesetzt).length).toBe(1);
		expect(erg.sitze.length).toBe(7);
	});
});

describe('Samtgemeinderat Bardowick 2021', () => {
	it('rechnet den Ein-Wahlbereich-Fall nach § 36 korrekt', async () => {
		const daten = await lade({
			ags: '033555402',
			wahlId: 222,
			gebietId: 'ebene_3_id_441',
			titel: 'Samtgemeindewahl',
			direktwahl: false
		});
		expect(daten.bereiche.length).toBe(1); // ein Wahlbereich → § 36
		expect(daten.amtlicheSitze?.anzahl).toBe(32);

		const erg = verteileSitze(daten.bereiche, 32);
		const amtlich = new Set(
			daten.amtlicheSitze!.gewaehlte.map(([p, name]) => `${p}|${normName(name)}`)
		);
		const berechnet = new Set(erg.sitze.filter((s) => s.name).map((s) => `${s.partei}|${normName(s.name!)}`));
		expect([...berechnet].filter((x) => !amtlich.has(x))).toEqual([]);
		expect([...amtlich].filter((x) => !berechnet.has(x))).toEqual([]);
	});
});
