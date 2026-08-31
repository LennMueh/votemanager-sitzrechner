import { describe, expect, it } from 'vitest';
import { amtlicheVerteilung, gegenprobe, waehleSitzzahl, waehleStandardtermin } from './daten';
import { vertretungsSchluessel } from './vergleich';
import type { Sitz, Sitzverteilung, Stimmenverhaeltnis } from '$lib/nkwg';
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

// ---------------------------------------------------------------------------
// Amtliche Liste der Gewählten
// ---------------------------------------------------------------------------

/**
 * Ortsrat Oedeme, Hansestadt Lüneburg, Kommunalwahl 2021 — der Lehrbuchfall.
 *
 * Sieben Sitze. Nach Hare/Niemeyer bekommen die GRÜNEN drei, haben aber nur zwei
 * Bewerber; der dritte Sitz bleibt nach § 36 Abs. 7 NKWG unbesetzt. Die amtliche
 * Liste führt darum nur sechs Namen.
 */
// Überschriften wie im Archiv (häufigste Form, 2.787 Dokumente) — gelesen wird
// über sie, nie über die Position.
const SPALTEN = ['Partei', 'Kandidat/in', 'Mandat', 'Stimmen'];
const OEDEME = [
	['SPD', 'Anke Schmidt', 'Personenwahl', '412'],
	['CDU', 'Bernd Müller', 'Personenwahl', '388'],
	['CDU', 'Claudia Meyer', 'Personenwahl', '301'],
	['CDU', 'Dirk Wagner', 'Personenwahl', '255'],
	['GRÜNE', 'Eva Becker', 'Personenwahl', '502'],
	['GRÜNE', 'Frank Hoffmann', 'Personenwahl', '431']
];

const stimmen: Stimmenverhaeltnis = {
	stimmenGesamt: 7959,
	parteien: [
		{ partei: 'GRÜNE', farbe: '#46962b', stimmen: 2885, prozent: 36.2 },
		{ partei: 'CDU', farbe: '#000000', stimmen: 2870, prozent: 36.1 },
		{ partei: 'SPD', farbe: '#e3000f', stimmen: 1612, prozent: 20.3 },
		{ partei: 'FDP', farbe: '#ffed00', stimmen: 592, prozent: 7.4 }
	]
};

const sitz = (partei: string, name: string): Sitz => ({ partei, name, art: 'personenwahl', mandat: 'direkt' });
const leer = (partei: string, farbe?: string): Sitz => ({
	partei, farbe, art: 'unbesetzt', mandat: 'unbesetzt', unbesetzt: true,
	grund: '§ 36 Abs. 7 NKWG — Wahlvorschlag hat weniger Bewerber als Sitze'
});

/** Die eigene Rechnung für Oedeme: SPD 1, CDU 3, GRÜNE 3 — davon einer unbesetzt. */
function eigeneRechnung(sitze: Sitz[]): Sitzverteilung {
	const jePartei = new Map<string, number>();
	for (const s of sitze) jePartei.set(s.partei, (jePartei.get(s.partei) ?? 0) + 1);
	return {
		sitzeGesamt: sitze.length,
		gueltigeStimmen: stimmen.stimmenGesamt,
		parteien: [...jePartei].map(([partei, anzahl]) => ({ partei, stimmen: 0, prozent: 0, sitze: anzahl })),
		sitze,
		losentscheide: [],
		losfaelle: []
	};
}

const OEDEME_GERECHNET = eigeneRechnung([
	sitz('SPD', 'Anke Schmidt'),
	sitz('CDU', 'Bernd Müller'), sitz('CDU', 'Claudia Meyer'), sitz('CDU', 'Dirk Wagner'),
	sitz('GRÜNE', 'Eva Becker'), sitz('GRÜNE', 'Frank Hoffmann'), leer('GRÜNE', '#46962b')
]);

describe('amtliche Verteilung füllt auf die Sitzzahl auf', () => {
	it('übernimmt die unbesetzten Sitze der eigenen Rechnung, wenn sie die Lücke erklärt', () => {
		// Ohne Auffüllen zeigte das Sitzdiagramm sechs Punkte, während daneben
		// „7 Sitze, amtlich" stand. Die Invariante muss auch hier gelten.
		const v = amtlicheVerteilung({ anzahl: 7, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen, OEDEME_GERECHNET);
		expect(v.sitze.length).toBe(7);
		expect(v.sitzeGesamt).toBe(7);
		const unbesetzt = v.sitze.filter((s) => s.unbesetzt);
		expect(unbesetzt.length).toBe(1);
		// Der leere Platz gehört den GRÜNEN — das sagt nur die eigene Rechnung.
		expect(unbesetzt[0].partei).toBe('GRÜNE');
		expect(unbesetzt[0].farbe).toBe('#46962b');
		// Und die Legende zählt ihn mit, sonst stünde „GRÜNE 2" neben sieben Punkten.
		expect(v.parteien.find((p) => p.partei === 'GRÜNE')?.sitze).toBe(3);
	});

	it('meldet dabei keine Abweichung — die Rechnung stimmt ja', () => {
		// Der Fehlalarm, der die Oberfläche „Die eigene Rechnung weicht vom
		// amtlichen Ergebnis ab" schreiben ließ: verglichen wurde die Zuteilung
		// (GRÜNE 3) gegen die amtlich Gewählten (2).
		const v = amtlicheVerteilung({ anzahl: 7, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen, OEDEME_GERECHNET);
		expect(gegenprobe(OEDEME_GERECHNET, v)).toEqual([]);
	});

	it('füllt ohne eigene Rechnung ohne Wahlvorschlag auf, statt einen zu erfinden', () => {
		const v = amtlicheVerteilung({ anzahl: 7, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen);
		expect(v.sitze.length).toBe(7);
		const unbesetzt = v.sitze.filter((s) => s.unbesetzt);
		expect(unbesetzt.length).toBe(1);
		expect(unbesetzt[0].partei).toBe('');
		expect(unbesetzt[0].farbe).toBeUndefined();
		// Ein leerer Wahlvorschlag darf keine Legendenzeile erzeugen.
		expect(v.parteien.map((p) => p.partei)).not.toContain('');
	});

	it('folgt einer widersprechenden Rechnung nicht', () => {
		// Hier behauptet die eigene Rechnung einen SPD-Sitz mehr, als die amtliche
		// Liste kennt. Dann ist die Zuordnung des leeren Platzes nicht belegt —
		// und die Abweichung gehört gemeldet, nicht kaschiert.
		const falsch = eigeneRechnung([
			sitz('SPD', 'Anke Schmidt'), sitz('SPD', 'Gerd Klein'),
			sitz('CDU', 'Bernd Müller'), sitz('CDU', 'Claudia Meyer'), sitz('CDU', 'Dirk Wagner'),
			sitz('GRÜNE', 'Eva Becker'), leer('GRÜNE', '#46962b')
		]);
		const v = amtlicheVerteilung({ anzahl: 7, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen, falsch);
		expect(v.sitze.length).toBe(7);
		expect(v.sitze.filter((s) => s.unbesetzt)[0].partei).toBe('');
		expect(gegenprobe(falsch, v)).toEqual([
			'SPD: gerechnet 2, amtlich 1',
			'GRÜNE: gerechnet 1, amtlich 2'
		]);
	});

	it('nimmt die Namen ernster als die Zahl, wenn die Liste länger ist', () => {
		// Ortsbeirat Frankfurt-Mitte/Nord 2016: `anzahl` sagt 19, die Tabelle nennt
		// 20 Personen. `anzahl` stammt aus einer Tortendiagramm-Summe, die Tabelle
		// aus der Feststellung des Wahlausschusses.
		const v = amtlicheVerteilung({ anzahl: 5, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen);
		expect(v.sitze.length).toBe(6);
		expect(v.sitzeGesamt).toBe(6);
		expect(v.sitze.filter((s) => s.unbesetzt)).toEqual([]);
	});
});

describe('Gegenprobe der eigenen Rechnung', () => {
	it('meldet eine echte Abweichung weiter', () => {
		// Der Laufzeit-Referenztest darf nicht dadurch verstummen, dass unbesetzte
		// Sitze ausgenommen werden: hier zieht die CDU einen Sitz zu viel.
		const zuviel = eigeneRechnung([
			sitz('SPD', 'Anke Schmidt'),
			sitz('CDU', 'Bernd Müller'), sitz('CDU', 'Claudia Meyer'),
			sitz('CDU', 'Dirk Wagner'), sitz('CDU', 'Hanna Vogel'),
			sitz('GRÜNE', 'Eva Becker'), sitz('GRÜNE', 'Frank Hoffmann')
		]);
		const v = amtlicheVerteilung({ anzahl: 7, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen, zuviel);
		expect(gegenprobe(zuviel, v)).toEqual(['CDU: gerechnet 4, amtlich 3']);
	});

	it('bleibt ohne eigene Rechnung stumm', () => {
		const v = amtlicheVerteilung({ anzahl: 6, spalten: SPALTEN, gewaehlte: OEDEME }, stimmen);
		expect(gegenprobe(undefined, v)).toEqual([]);
	});
});
