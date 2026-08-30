import { describe, expect, it } from 'vitest';
import { waehleSitzzahl, waehleStandardtermin } from './daten';
import { vertretungsSchluessel } from './vergleich';
import sitzzahlen from '$lib/sitzzahlen.json';
import sitzzahlenManuell from '$lib/sitzzahlen-manuell.json';

describe('dynamischer Standardtermin', () => {
	it('nimmt den nächsten Termin, sonst den neuesten vergangenen', () => {
		expect(waehleStandardtermin(['20210912', '20260913', '20280910'], '20260826')).toBe('20260913');
		expect(waehleStandardtermin(['20210912', '20250914'], '20260826')).toBe('20250914');
		expect(waehleStandardtermin([], '20260826')).toBe('');
	});
});

describe('Sitzzahlen-Tabellen', () => {
	it('haben keine widersprüchlichen Schlüssel', () => {
		// Der stabile Schlüssel führt Schreibvarianten derselben Wahl zusammen —
		// das ist gewollt („Wahl des Ortsrates - Oedeme" und „Wahl des Ortsrates
		// Oedeme - Oedeme"). Treffen dabei zwei *verschiedene* Sitzzahlen
		// aufeinander, gewinnt stillschweigend die letzte. Das darf nicht passieren.
		const gesehen = new Map<string, { sitze: number; quelle: string }>();
		const streit: string[] = [];
		for (const tabelle of [sitzzahlen.vertretungen, sitzzahlenManuell.vertretungen]) {
			for (const [roh, wert] of Object.entries(tabelle as Record<string, { sitze: number }>)) {
				const trenner = roh.indexOf('|');
				const schluessel = vertretungsSchluessel(roh.slice(0, trenner), roh.slice(trenner + 1));
				const alt = gesehen.get(schluessel);
				if (alt && alt.sitze !== wert.sitze) streit.push(`${schluessel}: ${alt.quelle} ${alt.sitze} ≠ ${roh} ${wert.sitze}`);
				gesehen.set(schluessel, { sitze: wert.sitze, quelle: roh });
			}
		}
		expect(streit).toEqual([]);
	});
});

describe('Rangfolge der Sitzzahl-Quellen', () => {
	it('nimmt die amtliche Zahl und führt die abweichende Vorwahl mit', () => {
		// Echter Fall aus dem Archiv: der Kreistag des Landkreises Freudenstadt
		// wuchs zwischen 2019 und 2024 von 41 auf 44 Sitze. Genau dafür darf die
		// Vorwahl nie die stärkste Quelle sein.
		const befund = waehleSitzzahl([
			{ herkunft: 'vorwahl', sitze: 41, stand: '20190526' },
			{ herkunft: 'amtlich', sitze: 44 }
		]);
		expect(befund.sitze).toBe(44);
		expect(befund.herkunft).toBe('amtlich');
		expect(befund.quellen.filter((q) => q.sitze !== befund.sitze)).toEqual([
			{ herkunft: 'vorwahl', sitze: 41, stand: '20190526' }
		]);
	});

	it('zieht die hinterlegte Zahl der Vorwahl vor, weicht aber der amtlichen', () => {
		// Gemeinderat Hochdorf: 13 Sitze 2019, 12 Sitze 2024 — die Zahl kann auch
		// fallen. Die hinterlegte Zahl stammt aus der Bekanntmachung der
		// Wahlleitung und ist damit aktueller als die Vorwahl.
		expect(waehleSitzzahl([
			{ herkunft: 'vorwahl', sitze: 13, stand: '20190526' },
			{ herkunft: 'hinterlegt', sitze: 12 }
		])).toMatchObject({ sitze: 12, herkunft: 'hinterlegt' });
	});

	it('bleibt ohne Quelle leer, statt eine Zahl zu erfinden', () => {
		// Eine falsche Sitzzahl ist schlimmer als keine: sie erzeugt plausible Namen.
		expect(waehleSitzzahl([])).toMatchObject({ sitze: undefined, herkunft: undefined });
	});
});
