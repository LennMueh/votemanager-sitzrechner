/**
 * Wahllokal-Tabelle gegen eingefrorene Dokumente der Kommunalwahl 2021.
 *
 * Drei Dinge gehen hier still kaputt, wenn niemand nachrechnet:
 *
 *  1. Die Spaltenflucht der Übersicht. `tabelle.header` zählt zwei Spalten mehr
 *     als `felder`; verschiebt sich das, liest `parseBezirksuebersicht` die
 *     Wahlbeteiligung aus der falschen Spalte. Gegengeprüft über `felder[i].tip`,
 *     den der Host selbst mit dem Spaltennamen füllt.
 *  2. Die Gebietszuordnung. Bei einer Samtgemeinde teilen sich alle
 *     Mitgliedsgemeinden eine Gemeindewahl; deren Bezirksübersicht führt alle 26
 *     Wahlbezirke der Samtgemeinde. Ohne den Schnitt über `gebietsverlinkung`
 *     bekäme die Gemeinde Handorf 26 Wahllokale statt 3.
 *  3. Der Spaltensatz. Die Übersicht kürzt auf die vier stärksten
 *     Wahlvorschläge der ganzen Wahl plus „Sonstige" — in Handorf also eine
 *     Spalte für eine dort nicht wählbare Wählergemeinschaft, während sich die
 *     NPD hinter „Sonstige" versteckt. Deshalb kommen die Zahlen aus den
 *     Einzeldokumenten.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { baueBezirksmatrix } from './bezirke';
import { bezirkeDesGebiets, parseBezirksuebersicht, parseErgebnis } from './votemanager';

// Nicht unter referenzen/: dort ist jedes Unterverzeichnis ein Bundesland, und
// referenzen.test.ts liest sie alle ein.
const WURZEL = join(import.meta.dirname, '..', '..', 'fixtures', 'wahlbezirke');

/** Nur so viel Gestalt, wie dieser Test selbst anfasst; die Parser bekommen `as never`. */
interface RohDokument {
	tabelle?: { header: { labelKurz: string }[]; zeilen: { felder: { tip?: string }[] }[] };
}

function lies(name: string): RohDokument {
	return JSON.parse(gunzipSync(readFileSync(join(WURZEL, `${name}.json.gz`))).toString('utf8')).inhalt;
}

const gemeindewahl = lies('gemeindewahl-uebersicht');
const kreiswahl = lies('kreiswahl-uebersicht');
const direktwahl = lies('direktwahl-uebersicht');
const handorf = lies('gemeindewahl-handorf');
const samtgemeinde = lies('samtgemeindewahl-gesamt');

const WAHLLOKALE = {
	ebene_6_id_69553: lies('wahllokal-handorf-i'),
	ebene_6_id_69554: lies('wahllokal-handorf-ii'),
	ebene_6_id_69781: lies('wahllokal-handorf-briefwahl')
} as const;

/** Wie `holeWahlbezirke()` es tut: Zugehörigkeit schneiden, dann Matrix bauen. */
function matrixFuer(gebiet: RohDokument, vorhanden: Partial<Record<string, RohDokument>> = WAHLLOKALE) {
	const { ids } = bezirkeDesGebiets(gebiet as never);
	return baueBezirksmatrix(
		parseErgebnis(gebiet as never),
		ids.map((id) => {
			const roh = vorhanden[id];
			return { id, ergebnis: roh ? parseErgebnis(roh as never) : undefined };
		})
	);
}

describe('Spaltenflucht der Bezirksübersicht', () => {
	// Der Host schreibt den Spaltennamen in `tip`, sobald die Spalte einen
	// trägt (bei Wahlberechtigten und „Sonstige" wiederholt er nur die Zahl).
	// Verschiebt sich die Flucht um eine Stelle, schlägt das hier an.
	for (const [name, roh] of [
		['Gemeindewahl', gemeindewahl],
		['Kreiswahl', kreiswahl],
		['Direktwahl', direktwahl]
	] as const satisfies readonly (readonly [string, RohDokument])[]) {
		it(`${name}: felder fluchten mit header[2:]`, () => {
			const kopf = roh.tabelle!.header.map((h: { labelKurz: string }) => h.labelKurz).slice(2);
			let geprueft = 0;
			for (const z of roh.tabelle!.zeilen) {
				expect(z.felder).toHaveLength(kopf.length);
				z.felder.forEach((f: { tip?: string }, i: number) => {
					if (f.tip && f.tip === kopf[i]) geprueft++;
					else if (f.tip && kopf.includes(f.tip)) expect(f.tip).toBe(kopf[i]);
				});
			}
			expect(geprueft).toBeGreaterThan(0);
		});
	}
});

describe('Stand und Beteiligung aus der Übersicht', () => {
	it('Aggregatzeilen (stimmbezirk: false) sind keine Wahllokale', () => {
		// Die Kreiswahl-Übersicht führt 27 Zeilen: 26 Stimmbezirke und die
		// Summenzeile „Samtgemeinde Bardowick — 26 von 26".
		expect(kreiswahl.tabelle!.zeilen).toHaveLength(27);
		expect(parseBezirksuebersicht(kreiswahl as never)).toHaveLength(26);
	});

	it('liest Stand und Beteiligung eines Wahllokals', () => {
		const b = parseBezirksuebersicht(gemeindewahl as never).find((x) => x.name === '542 Handorf II')!;
		expect(b.id).toBe('ebene_6_id_69554');
		expect(b.ausgezaehlt).toBe(true);
		expect(b.standText).toBe('eingegangen');
		expect(b.beteiligung?.berechtigte).toBe(990);
		expect(b.beteiligung?.waehler).toBe(448);
		expect(b.beteiligung?.anteil).toBeCloseTo(0.4525, 4);
	});

	it('Briefwahlbezirke führen keine Wahlberechtigten', () => {
		// Sie zählen in ihrem Urnenbezirk mit; eine Beteiligung wäre erfunden.
		const b = parseBezirksuebersicht(gemeindewahl as never).find((x) => x.name === 'B934 Briefwahl Handorf')!;
		expect(b.beteiligung).toBeUndefined();
	});
});

describe('Zuordnung zum Gebiet', () => {
	it('Gemeinde Handorf bekommt ihre drei Wahllokale, nicht die 26 der Samtgemeinde', () => {
		const { ebeneId, ids } = bezirkeDesGebiets(handorf as never);
		expect(ebeneId).toBe('ebene_6');
		const gehoert = new Set(ids);
		const bezirke = parseBezirksuebersicht(gemeindewahl as never).filter((b) => gehoert.has(b.id));
		expect(bezirke.map((b) => b.name)).toEqual([
			'541 Handorf I',
			'542 Handorf II',
			'B934 Briefwahl Handorf'
		]);
	});

	it('die Samtgemeinde selbst bekommt alle 26', () => {
		expect(bezirkeDesGebiets(samtgemeinde as never).ids).toHaveLength(26);
	});
});

describe('Spalten: alle angetretenen Wahlvorschläge, und nur die', () => {
	it('Handorf zeigt die NPD und keine Wählergemeinschaft, die dort nicht antrat', () => {
		// Die Übersicht des Hosts nennt für dieselbe Wahl SPD, CDU, GRÜNE, WfB,
		// Sonstige. WfB stand in Handorf nicht auf dem Stimmzettel, die NPD schon.
		const kopfDerUebersicht = gemeindewahl.tabelle!.header.map((h) => h.labelKurz).slice(2);
		expect(kopfDerUebersicht).toContain('WfB');
		expect(kopfDerUebersicht).toContain('Sonstige');

		const { spalten } = matrixFuer(handorf);
		expect(spalten.map((s) => s.label)).toEqual(['CDU', 'SPD', 'GRÜNE', 'NPD']);
	});

	it('führt die Parteifarbe des Hosts je Spalte mit', () => {
		const { spalten } = matrixFuer(handorf);
		expect(spalten.find((s) => s.label === 'SPD')?.farbe).toBe('#d60029');
	});

	it('Spalten stehen nach Stimmen des Gebiets absteigend', () => {
		const { spalten, zeilen } = matrixFuer(handorf);
		const summe = spalten.map((_, i) =>
			Object.values(zeilen).reduce((s, z) => s + z[i].absolut, 0)
		);
		expect(summe).toEqual([...summe].sort((a, b) => b - a));
	});
});

describe('Zahlen je Wahllokal', () => {
	it('treffen die Zahlen, die die Übersicht für ihre gekürzten Spalten nannte', () => {
		// Beleg, dass der Wechsel der Quelle nichts verschiebt: die Übersicht
		// nennt für 542 Handorf II SPD 499, CDU 538, GRÜNE 202.
		const { spalten, zeilen } = matrixFuer(handorf);
		const zeile = zeilen['ebene_6_id_69554'];
		const wert = (partei: string) => zeile[spalten.findIndex((s) => s.label === partei)].absolut;
		expect(wert('SPD')).toBe(499);
		expect(wert('CDU')).toBe(538);
		expect(wert('GRÜNE')).toBe(202);
		// Und was dort als „Sonstige 85" stand, ist die NPD.
		expect(wert('NPD')).toBe(85);
	});

	it('Anteile beziehen sich auf alle Stimmen des Wahllokals', () => {
		const { zeilen } = matrixFuer(handorf);
		const zeile = zeilen['ebene_6_id_69554'];
		expect(zeile.reduce((s, z) => s + z.absolut, 0)).toBe(1324); // gültige Stimmen
		expect(zeile.reduce((s, z) => s + z.anteil, 0)).toBeCloseTo(1, 6);
	});

	it('ein Wahllokal ohne Dokument bekommt keine Zeile, keine Nullen', () => {
		const { zeilen } = matrixFuer(handorf, {
			ebene_6_id_69553: WAHLLOKALE.ebene_6_id_69553,
			ebene_6_id_69554: WAHLLOKALE.ebene_6_id_69554
		});
		expect(Object.keys(zeilen)).toEqual(['ebene_6_id_69553', 'ebene_6_id_69554']);
		expect(zeilen['ebene_6_id_69781']).toBeUndefined();
	});
});
