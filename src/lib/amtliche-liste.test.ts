/**
 * Die amtliche Liste der Gewählten wird über die Spaltenüberschriften gelesen,
 * nicht über Positionen. Alle Zeilen hier stammen unverändert aus dem Archiv.
 */

import { describe, expect, it } from 'vitest';
import { amtlicheGewaehlte } from './votemanager';

describe('Amtliche Liste der Gewählten', () => {
	it('liest die dreispaltige Form (Saarland, Nordrhein-Westfalen)', () => {
		const erg = amtlicheGewaehlte(
			['Partei', 'Kandidat/in', 'Mandat'],
			[
				['SPD', 'Dr. Schmidt, Stephan Josef', 'Gebietsliste 1'],
				['ABG', 'Göckmann, Rolf', 'Reservelistenplatz 1']
			]
		);
		expect(erg).toEqual([
			{ partei: 'SPD', name: 'Dr. Schmidt, Stephan Josef', mandat: 'Gebietsliste 1', stimmen: undefined, wahlbereich: undefined },
			{ partei: 'ABG', name: 'Göckmann, Rolf', mandat: 'Reservelistenplatz 1', stimmen: undefined, wahlbereich: undefined }
		]);
	});

	it('liest die vierspaltige Form mit Stimmen', () => {
		const [erg] = amtlicheGewaehlte(
			['Partei', 'Kandidat/in', 'Mandat', 'Stimmen'],
			[['AWG', 'Hagemann, Guido', 'direkt gewählt', '1.154']]
		);
		// Deutscher Tausenderpunkt: 1154, nicht 1.
		expect(erg).toMatchObject({ name: 'Hagemann, Guido', mandat: 'direkt gewählt', stimmen: 1154 });
	});

	it('nimmt in der fünfspaltigen Form den Bewerber und nicht den Teilort', () => {
		// Der eigentliche Grund für die Auswertung über Überschriften: der Teilort
		// steht an zweiter Stelle und sieht aus wie „Nachname, Vorname". Jede
		// Positions- oder Musterheuristik würde ihn für den Namen halten.
		const [erg] = amtlicheGewaehlte(
			['Wahlvorschlag', 'Wohnbezirk', 'Bewerber', 'Stimmen', 'Mandat'],
			[['AfD', 'Heidenheim, Schnaitheim, Aufhausen u. Mergelstetten', 'Malzahn, Bernd', '7.141', 'Gewählt']]
		);
		expect(erg.name).toBe('Malzahn, Bernd');
		expect(erg.wahlbereich).toBe('Heidenheim, Schnaitheim, Aufhausen u. Mergelstetten');
		expect(erg).toMatchObject({ partei: 'AfD', stimmen: 7141, mandat: 'Gewählt' });
	});

	it('übergeht unbekannte Spalten, statt sie zu deuten', () => {
		const [erg] = amtlicheGewaehlte(
			['Partei', 'Kandidat/in', 'Irgendwas', 'Mandat'],
			[['CDU', 'Anna, Horst-Peter', 'unklar', 'Personenwahl']]
		);
		expect(erg).toMatchObject({ name: 'Anna, Horst-Peter', mandat: 'Personenwahl' });
	});

	it('liefert nichts ohne Namensspalte', () => {
		// Lieber gar keine Zeile als eine Spalte, die zufällig wie ein Name aussieht.
		expect(amtlicheGewaehlte(['Partei', 'Sitze'], [['SPD', '12']])).toEqual([]);
		expect(amtlicheGewaehlte([], [['SPD', 'Meier, Anna']])).toEqual([]);
	});

	it('lässt leere Namenszeilen aus', () => {
		expect(
			amtlicheGewaehlte(['Partei', 'Kandidat/in'], [['SPD', ''], ['CDU', 'Meier, Anna']])
		).toHaveLength(1);
	});
});
