import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { sitzzahlNachEinwohnern, staffelText } from './ni-sitzzahl';
import { einwohnerFuer } from './ni-einwohner';
import einwohner2021 from './einwohner-ni-2021.json';
import einwohner2026 from './einwohner-ni.json';

describe('§ 46 NKomVG — Staffelgrenzen', () => {
	// An der Grenze entscheidet ein einzelner Einwohner über zwei Sitze. Deshalb
	// je Grenze der letzte und der erste Einwohner, nicht die Mitte.
	it('trennt sauber an jeder Grenze aus Absatz 1', () => {
		const g = (e: number) => sitzzahlNachEinwohnern(e, 'gemeinde');
		expect(g(500)).toBe(6);
		expect(g(501)).toBe(8);
		expect(g(1_000)).toBe(8);
		expect(g(1_001)).toBe(10);
		expect(g(7_000)).toBe(18);
		expect(g(7_001)).toBe(20);
		expect(g(8_000)).toBe(20);
		expect(g(8_001)).toBe(22);
		expect(g(600_000)).toBe(64);
		expect(g(600_001)).toBe(66);
	});

	it('trennt sauber an jeder Grenze aus Absatz 2 (Landkreise)', () => {
		const k = (e: number) => sitzzahlNachEinwohnern(e, 'landkreis');
		expect(k(100_000)).toBe(42);
		expect(k(100_001)).toBe(46);
		expect(k(150_000)).toBe(50);
		expect(k(150_001)).toBe(54);
		expect(k(175_000)).toBe(54);
		expect(k(175_001)).toBe(58);
		expect(k(200_000)).toBe(58);
		expect(k(200_001)).toBe(62);
		expect(k(400_000)).toBe(68);
		expect(k(400_001)).toBe(70);
	});

	it('gibt der Region Hannover ihre feste Zahl (Absatz 3)', () => {
		expect(sitzzahlNachEinwohnern(1_200_000, 'regionHannover')).toBe(84);
	});

	it('erhöht nur in Mitgliedsgemeinden um eins', () => {
		expect(sitzzahlNachEinwohnern(4_200, 'gemeinde')).toBe(14);
		expect(sitzzahlNachEinwohnern(4_200, 'mitgliedsgemeinde')).toBe(15);
		// Die Samtgemeinde selbst ist keine Mitgliedsgemeinde.
		expect(sitzzahlNachEinwohnern(13_000, 'samtgemeinde')).toBe(30);
	});

	it('rechnet nicht mit unsinnigen Einwohnerzahlen', () => {
		expect(sitzzahlNachEinwohnern(-1, 'gemeinde')).toBeUndefined();
		expect(sitzzahlNachEinwohnern(Number.NaN, 'gemeinde')).toBeUndefined();
	});
});

describe('§ 46 NKomVG gegen belegte Fälle aus dem Archiv', () => {
	// Fünf Zahlen, die nicht aus dem Gesetzestext stammen, sondern aus amtlichen
	// Ergebnissen bzw. einer Bekanntmachung. Trifft die Staffel sie nicht, ist die
	// Staffel falsch abgeschrieben — nicht die Wirklichkeit.
	it.each([
		['Landkreis Lüneburg 2021', 187_000, 'landkreis', 58],
		['Samtgemeinde Elbmarsch 2021', 13_000, 'samtgemeinde', 30],
		['Gemeinde Drage 2021 (Mitgliedsgemeinde)', 4_200, 'mitgliedsgemeinde', 15],
		// Flecken Bardowick fiel zwischen beiden Wahlen unter 7 000 Einwohner:
		// amtlich 21 (2021), Änderungsbekanntmachung vom 01.09.2026 auf 19.
		['Flecken Bardowick 2021', 7_400, 'mitgliedsgemeinde', 21],
		['Flecken Bardowick 2026', 6_800, 'mitgliedsgemeinde', 19]
	] as const)('%s', (_name, einwohner, art, erwartet) => {
		expect(sitzzahlNachEinwohnern(einwohner, art)).toBe(erwartet);
	});
});

describe('Staffeltext für den Hinweis', () => {
	it('nennt Absatz und Spanne', () => {
		expect(staffelText(6_800, 'mitgliedsgemeinde')).toBe('§ 46 Abs. 1 NKomVG, 6001 bis 7000');
		expect(staffelText(187_000, 'landkreis')).toBe('§ 46 Abs. 2 NKomVG, 175001 bis 200000');
		expect(staffelText(700_000, 'gemeinde')).toBe('§ 46 Abs. 1 NKomVG, mehr als 600000');
	});
});

describe('Gegenprobe gegen den Korpus: § 46 an allen Vertretungen 2021', () => {
	// Der Beleg, nicht die Vermutung — dieselbe Methodik wie verfahren.test.ts.
	// Gerechnet wird mit der Einwohnerzahl zum 30.06.2020, also dem Stichtag nach
	// § 177 Abs. 2 Satz 1 NKomVG für die Wahl am 12.09.2021, und geprüft gegen die
	// amtlichen Sitzzahlen aus dem Archiv.
	const faelle = (JSON.parse(gunzipSync(readFileSync('referenzen/ni-sitzzahlen-2021.json.gz')).toString()) as
		{ faelle: Array<{ kennung: string; titel: string; gebiet: string; sitze: number }> }).faelle;

	const gerechnet = faelle.map((f) => {
		const treffer = einwohnerFuer(einwohner2021 as never, f.kennung, f.titel, f.gebiet);
		return treffer ? { ...f, ...treffer, ergebnis: sitzzahlNachEinwohnern(treffer.einwohner, treffer.art) } : undefined;
	}).filter((x) => x !== undefined);

	it('findet für nahezu jede Vertretung eine Einwohnerzahl', () => {
		// Kreiswahl-Teilansichten je Gemeinde sind keine eigene Vertretung und
		// fallen zu Recht heraus; für den Rest muss die Zuordnung greifen.
		const zuordenbar = faelle.filter((f) => !/kreis/i.test(f.titel) || f.kennung.endsWith('000'));
		expect(gerechnet.length / zuordenbar.length).toBeGreaterThan(0.98);
	});

	it('trifft die amtliche Sitzzahl in mindestens 93 % der Fälle', () => {
		const treffer = gerechnet.filter((f) => f.ergebnis === f.sitze).length;
		const quote = treffer / gerechnet.length;
		// Gemessen 93,8 % (848 von 904). Die Quote darf nur steigen: fällt sie,
		// stimmt entweder die Staffel nicht mehr oder die Zuordnung ist kaputt.
		expect(quote).toBeGreaterThan(0.93);
	});

	it('weicht ausschließlich um 2, 4 oder 6 ab — die Stufen des § 46 Abs. 4', () => {
		// Das ist der eigentliche Beleg. Eine Verringerungssatzung kann die Zahl
		// nur um 2, 4 oder 6 senken; keine Einwohnerzahl sieht sie. Läge auch nur
		// eine Abweichung außerhalb dieses Rasters, wäre die Staffel falsch
		// abgeschrieben und nicht bloß eine Satzung im Spiel.
		const ausreisser = gerechnet
			.filter((f) => f.ergebnis !== f.sitze)
			.filter((f) => ![2, 4, 6].includes(Math.abs((f.ergebnis ?? 0) - f.sitze)));
		expect(ausreisser.map((f) => `${f.gebiet}: amtlich ${f.sitze}, gerechnet ${f.ergebnis}`)).toEqual([]);
	});
});

describe('Stichtagsfenster nach § 177 Abs. 2 Satz 1 NKomVG', () => {
	// Die eingefrorene Einwohnertabelle gilt für genau ein Wahlfenster. Ohne diese
	// Schranke hinge die Zahl vom 30.06.2025 auch an der Wahl 2021.
	it('deckt genau 12 bis 18 Monate vor dem Wahltag ab', () => {
		expect(einwohner2026._stichtag).toBe('20250630');
		const monate = (t: string) => Number(t.slice(0, 4)) * 12 + Number(t.slice(4, 6));
		const abstand = (w: string) => monate(w) - monate(einwohner2026._stichtag);
		expect(abstand('20260913')).toBeGreaterThanOrEqual(12);
		expect(abstand('20260913')).toBeLessThanOrEqual(18);
		expect(abstand('20210912')).toBeLessThan(12);   // Wahl 2021: außerhalb
	});
});
