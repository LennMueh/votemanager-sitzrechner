import { describe, expect, it } from 'vitest';
import { direktwahl, verteileSitze, type Wahlbereich } from './nkwg';

const kandidat = (name: string, stimmen: number, listenplatz: number) => ({ name, stimmen, listenplatz });
const bereich = (id: string, vorschlaege: Wahlbereich['vorschlaege']): Wahlbereich => ({ id, name: id, vorschlaege });

describe('strukturierte Losfälle', () => {
	it('erfasst die Sitzverteilung auf Wahlvorschläge (§ 36 Abs. 2)', () => {
		const erg = verteileSitze([bereich('W', [
			{ partei: 'A', listenstimmen: 0, kandidaten: [kandidat('A1', 100, 1)] },
			{ partei: 'B', listenstimmen: 0, kandidaten: [kandidat('B1', 100, 1)] }
		])], 1);
		const los = erg.losfaelle.find((x) => x.rechtsgrundlage.includes('Abs. 2'))!;
		expect(los.betroffene).toEqual(['A', 'B']);
		expect(los.vorlaeufig).toEqual(['A']);
		expect(erg.losentscheide).toContain(los.text);
	});

	it('erfasst die Verteilung auf Wahlbereiche (§ 37 Abs. 3)', () => {
		const erg = verteileSitze([
			bereich('W1', [{ partei: 'P', listenstimmen: 0, kandidaten: [kandidat('A', 100, 1)] }]),
			bereich('W2', [{ partei: 'P', listenstimmen: 0, kandidaten: [kandidat('B', 100, 1)] }])
		], 1);
		const los = erg.losfaelle.find((x) => x.rechtsgrundlage.includes('§ 37 Abs. 3'))!;
		expect(los.betroffene).toEqual(['W1', 'W2']);
		expect(los.sitze).toBe(1);
	});

	it('erfasst Liste gegen Bewerber (§ 36 Abs. 4)', () => {
		const erg = verteileSitze([bereich('W', [{
			partei: 'P', listenstimmen: 100, kandidaten: [kandidat('A', 100, 1), kandidat('B', 0, 2)]
		}])], 1);
		const los = erg.losfaelle.find((x) => x.rechtsgrundlage.includes('Abs. 4'))!;
		expect(los.betroffene).toEqual(['liste', 'kandidaten']);
		expect(los.vorlaeufig).toEqual(['liste']);
	});

	it('erfasst alle Bewerber an der Mandatsgrenze (§ 36 Abs. 5)', () => {
		const erg = verteileSitze([bereich('W', [{
			partei: 'P', listenstimmen: 0, kandidaten: [kandidat('A', 100, 1), kandidat('B', 100, 2), kandidat('C', 100, 3)]
		}])], 1);
		const los = erg.losfaelle.find((x) => x.rechtsgrundlage.includes('Abs. 5 S. 4'))!;
		expect(los.betroffene).toEqual(['A', 'B', 'C']);
		expect(los.sitze).toBe(1);
	});

	it('erfasst den Übertrag zwischen Wahlbereichen (§ 37 Abs. 5)', () => {
		const erg = verteileSitze([
			bereich('W1', [{ partei: 'P', listenstimmen: 0, kandidaten: [kandidat('A', 300, 1)] }]),
			bereich('W2', [{ partei: 'P', listenstimmen: 0, kandidaten: [
				kandidat('B', 50, 1), kandidat('C', 50, 2), kandidat('D', 50, 3)
			] }])
		], 3);
		const los = erg.losfaelle.find((x) => x.rechtsgrundlage.includes('§ 37 Abs. 5'))!;
		expect(los.betroffene).toEqual(['W2: C', 'W2: D']);
		expect(los.vorlaeufig).toEqual(['W2: C']);
	});

	it('erfasst den zweiten Stichwahlplatz (§ 45g Abs. 2)', () => {
		const erg = direktwahl([
			{ name: 'A', stimmen: 40 }, { name: 'B', stimmen: 30 },
			{ name: 'C', stimmen: 30 }, { name: 'D', stimmen: 30 }
		]);
		expect(erg.losfall).toMatchObject({
			betroffene: ['B', 'C', 'D'], sitze: 1, vorlaeufig: ['B'], rechtsgrundlage: '§ 45g Abs. 2 NKWG'
		});
		expect(erg.losentscheid).toBe(erg.losfall?.text);
	});
});
