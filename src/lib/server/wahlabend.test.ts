import { describe, expect, it } from 'vitest';
import { plane, schluessel } from './wahlabend';

const stand = (pfadStandId: number, sha256: string, minute: number) => ({
	pfadStandId, sha256, erfasstAm: new Date(Date.UTC(2026, 7, 30, 16, minute)), inhalt: {}
});

describe('Zeitplan der Wahlabend-Wiedergabe', () => {
	it('ordnet nach Erfassungszeit und trennt den Grundzustand je Pfad ab', () => {
		const { grundzustand, schritte } = plane([
			stand(2, 'b2', 5), stand(1, 'a1', 0), stand(1, 'a2', 10), stand(2, 'b1', 1)
		]);
		expect(grundzustand.map((s) => s.sha256)).toEqual(['a1', 'b1']);
		expect(schritte.map((s) => s.sha256)).toEqual(['b2', 'a2']);
	});

	it('überspringt inhaltsgleiche Folgestände, die kein Ereignis erzeugen würden', () => {
		// UNIQUE (pfad_stand_id, sha256) verschluckt sie beim Einspielen — als
		// Schritt gezählt liefe der Takt an dieser Stelle stumm.
		const { schritte } = plane([stand(1, 'a1', 0), stand(1, 'a2', 1), stand(1, 'a1', 2)]);
		expect(schritte.map((s) => s.sha256)).toEqual(['a2']);
	});

	it('trennt gleiche Hashes auf verschiedenen Pfaden nicht', () => {
		const { grundzustand, schritte } = plane([stand(1, 'gleich', 0), stand(2, 'gleich', 1)]);
		expect(grundzustand).toHaveLength(2);
		expect(schritte).toHaveLength(0);
	});

	it('vergibt dieselben Ereignis-Schlüssel wie der Poller', () => {
		expect(schluessel(7, 'https://x/api/praesentation/wahl_702/ergebnis_ebene_-1950_id_4355_0.json'))
			.toEqual([
				'7:https://x/api/praesentation/wahl_702/ergebnis_ebene_-1950_id_4355_0.json',
				'uebersicht',
				'v:i7:702:ebene_-1950_id_4355'
			]);
		// Nicht-Ergebnisse bekommen keinen Vertretungs-Schlüssel.
		expect(schluessel(7, 'https://x/api/praesentation/wahl_702/wahl.json'))
			.toEqual(['7:https://x/api/praesentation/wahl_702/wahl.json', 'uebersicht']);
	});
});
