import { describe, expect, it, vi } from 'vitest';
import { konfiguration } from './config';
import { Drossel } from './drossel';
import { holeJson, retryAfter } from './http';
import { parseRegistry, Poller, type PollerAufgabe, type PollerSpeicher } from './index';
import { apiWurzel, termineUrl } from './urls';
import { fehlerBackoff, naechsterZustand, pruefIntervall } from './zustand';
import { parseErgebnis } from '../../votemanager';
import { deutschesDatum, filtereTermine, terminZustand } from '../db';

describe('Poller-Kern', () => {
	it('durchläuft die Wahlabend-Zustände und Takte', () => {
		const wahltag = new Date('2026-09-13T00:00:00+02:00');
		const jetzt = new Date('2026-09-13T17:45:00+02:00');
		expect(naechsterZustand('geplant', jetzt, { wahltag })).toBe('vorlauf');
		expect(naechsterZustand('vorlauf', jetzt, { wahltag, strukturGeladen: true })).toBe('wahlabend');
		expect(naechsterZustand('wahlabend', jetzt, { wahltag, vollstaendig: true })).toBe('nachlauf');
		expect(naechsterZustand('nachlauf', jetzt, { wahltag, amtlich: true })).toBe('beobachtung');
		expect(pruefIntervall('wahlabend')).toBe(30_000);
		expect(pruefIntervall('nachlauf')).toBe(900_000);
	});

	// Der 30-s-Takt hing allein an strukturGeladen, das nirgends gesetzt wurde.
	// Solange die Pfade fest als 'wahlabend' angelegt wurden, fiel das nicht auf.
	it('erreicht den Wahlabend auch ohne strukturGeladen', () => {
		const wahltag = new Date('2026-09-13T00:00:00+02:00');
		expect(naechsterZustand('geplant', new Date('2026-09-13T17:50:00+02:00'), { wahltag })).toBe('vorlauf');
		expect(naechsterZustand('geplant', new Date('2026-09-13T18:05:00+02:00'), { wahltag })).toBe('wahlabend');
		expect(naechsterZustand('vorlauf', new Date('2026-09-13T18:05:00+02:00'), { wahltag })).toBe('wahlabend');
		// Der Vorabend darf nichts auslösen — das war der Kern des Vorfalls.
		expect(naechsterZustand('geplant', new Date('2026-09-12T17:50:00+02:00'), { wahltag })).toBe('geplant');
		expect(naechsterZustand('geplant', new Date('2026-09-12T23:59:00+02:00'), { wahltag })).toBe('geplant');
	});

	// dokumentZustand hatte eine zweite, abweichende Regex für denselben Zweck.
	// Sie kannte den deutschen Tausenderpunkt nicht: "12 von 1.240" ergab [12, 1]
	// und damit vollstaendig — der Pfad wäre am Wahlabend sofort von 30 s auf
	// 15 min gefallen, unsichtbar hinter einer korrekten Anzeige.
	it('liest den Auszählstand mit deutschem Tausenderpunkt', () => {
		const stand = (hinweis: string) => parseErgebnis({ Komponente: { info: { hinweis: [hinweis] } } } as never).stand;
		expect(stand('12 von 1.240').vollstaendig).toBe(false);
		expect(stand('12 von 1.240').erwartet).toBe(1240);
		expect(stand('1.240 von 1.240').vollstaendig).toBe(true);
		expect(stand('142 von 142').vollstaendig).toBe(true);
		expect(stand('88 von 142').vollstaendig).toBe(false);
	});

	it('leitet den Zustand eines Termins aus dessen Datum ab', () => {
		const mittags = new Date('2026-08-30T12:00:00+02:00');
		expect(terminZustand('2026-09-13', mittags)).toBe('geplant');
		expect(terminZustand('2021-09-12', mittags)).toBe('ruhend');
		// Am Wahltag gilt dasselbe Zeitfenster wie beim Übergang: mittags noch
		// Vorlauf (15-min-Takt), erst nach Schließung der Wahllokale 30 s.
		expect(terminZustand('2026-08-30', mittags)).toBe('vorlauf');
		expect(terminZustand('2026-08-30', new Date('2026-08-30T18:05:00+02:00'))).toBe('wahlabend');
		// Kurz nach Mitternacht ist der UTC-Tag noch der Vortag — der Wahltag
		// darf deshalb nicht als Zukunft durchgehen.
		expect(terminZustand('2026-08-30', new Date('2026-08-30T00:30:00+02:00'))).toBe('vorlauf');
	});

	it('gibt dem Vorlauf einen eigenen Takt', () => {
		// Ohne eigenen Fall fiel vorlauf auf die 24-h-Vorgabe zurück und holte
		// die Struktur einmal am Tag — als Aufwärmphase wirkungslos.
		expect(pruefIntervall('vorlauf')).toBe(900_000);
		const wahltag = new Date('2026-09-13T00:00:00+02:00');
		expect(naechsterZustand('geplant', new Date('2026-09-13T09:00:00+02:00'), { wahltag })).toBe('vorlauf');
		// Frühstart nur im Endspurt, sonst zöge strukturGeladen den 30-s-Takt
		// über den halben Wahltag.
		expect(naechsterZustand('vorlauf', new Date('2026-09-13T09:00:00+02:00'), { wahltag, strukturGeladen: true })).toBe('vorlauf');
		expect(naechsterZustand('vorlauf', new Date('2026-09-13T17:50:00+02:00'), { wahltag, strukturGeladen: true })).toBe('wahlabend');
	});

	it('erntet eine vergangene Wahl genau einmal nach', () => {
		// Ruhende Pfade prüfen alle 30 Tage. Die Kette termine.json → app.js →
		// termin.json → ergebnis hat vier Glieder und bräuchte damit vier Monate
		// bis zur Sitzzahl der Vorwahl — für einen bevorstehenden Wahltag zu spät.
		expect(pruefIntervall('ruhend')).toBe(30 * 24 * 3_600_000);
		expect(pruefIntervall('nachernte')).toBe(300_000);

		// Genau einmal: naechsterZustand läuft nur nach einem erfolgreichen Abruf,
		// und danach gilt wieder der 30-Tage-Takt. Zusammen mit der Bedingung
		// „status IS NULL" der Beförderung kann kein Pfad zweimal geerntet werden.
		const wahltag = new Date('2021-09-12T00:00:00+02:00');
		const jetzt = new Date('2026-08-30T12:00:00+02:00');
		expect(naechsterZustand('nachernte', jetzt, { wahltag })).toBe('ruhend');
		expect(naechsterZustand('nachernte', jetzt, { wahltag, geaendert: true })).toBe('ruhend');
		// Auch ein Wahltag in der Zukunft zieht einen Nachernte-Pfad nicht in den
		// Vorlauf: die Nachernte gilt vergangenen Wahlen, nie der laufenden.
		expect(naechsterZustand('nachernte', jetzt, { wahltag: new Date('2026-09-13T00:00:00+02:00') })).toBe('ruhend');

		// Nach einem Fehler führt der Weg über 'unerreichbar' zurück in die
		// Nachernte und von dort erst zu 'ruhend' — der Pfad geht nicht verloren.
		expect(naechsterZustand('unerreichbar', jetzt, { wahltag })).toBe('unerreichbar');
	});

	it('begrenzt Backoff auf 24 Stunden und deaktiviert Backfill', () => {
		expect(fehlerBackoff(1)).toBe(30_000);
		expect(fehlerBackoff(99)).toBe(86_400_000);
		// Host-Backoff: eigener Deckel, Retry-After schlägt ihn.
		expect(fehlerBackoff(1, undefined, 3_600_000)).toBe(30_000);
		expect(fehlerBackoff(7, undefined, 3_600_000)).toBe(1_920_000);
		expect(fehlerBackoff(8, undefined, 3_600_000)).toBe(3_600_000);
		expect(fehlerBackoff(2, 7_200_000, 3_600_000)).toBe(7_200_000);
		// votemanager.kdo.de ist der Host aller 3143 Behörden: der 24-h-Backoff
		// eines einzelnen Pfades darf ihn nicht sperren, ein Retry-After schon.
		expect(fehlerBackoff(99)).toBeGreaterThan(3_600_000);
		expect(Math.max(fehlerBackoff(99, undefined, 3_600_000), 0)).toBe(3_600_000);
		expect(Math.max(fehlerBackoff(99, undefined, 3_600_000), 7_200_000)).toBe(7_200_000);
		expect(konfiguration({ CRAWLER_CONTACT: 'ops@example.test' }).backfill).toBe(false);
		expect(() => konfiguration({})).toThrow('CRAWLER_CONTACT');
	});

	it('löst Anbieterpfade auf statt sie aus Datumswerten zu bauen', () => {
		expect(termineUrl('https://example.test/root', '03355000')).toBe('https://example.test/root/03355000/api/termine.json');
		expect(apiWurzel('https://example.test/wahltermin-20240609/', `const apiRoot='../daten/api/';`)).toBe('https://example.test/wahltermin-20240609/daten/api/');
		expect(apiWurzel('https://example.test/20210912/praesentation/', `return "../api/praesentation/termin.json"`)).toBe('https://example.test/20210912/api/praesentation/');
	});

	it('liest bei kombinierten Wahlterminen den ersten Wahltag', () => {
		expect(deutschesDatum('14.09.2025 / 28.09.2025')).toBe('2025-09-14');
	});

	it('übernimmt neue Termine ungefiltert und filtert nur gezielte Läufe', () => {
		const termine = [
			{ date: '12.05.2030', name: 'Neue Wahl', url: '20300512/' },
			{ date: '14.09.2025', name: 'Probe', url: '20250914/' }
		];
		expect(filtereTermine(termine)).toEqual(termine);
		expect(filtereTermine(termine, ['20250914'])).toEqual([termine[1]]);
	});

	it('sendet Validatoren und behandelt 304 ohne Inhalt', async () => {
		const mock = vi.fn(async (_url, init) => {
			expect(new Headers(init?.headers).get('if-none-match')).toBe('abc');
			return new Response(null, { status: 304, headers: { etag: 'abc' } });
		});
		expect(await holeJson('https://example.test/x', { etag: 'abc' }, { kontakt: 'ops@example.test', fetch: mock as typeof fetch })).toEqual({ geaendert: false, stand: { etag: 'abc', lastModified: undefined } });
		expect(retryAfter('12')).toBe(12_000);
	});

	it('lässt je Host höchstens zwei Abrufe gleichzeitig laufen', async () => {
		const drossel = new Drossel(1_000, 2);
		let aktiv = 0;
		let maximum = 0;
		let loesen!: () => void;
		const sperre = new Promise<void>((resolve) => (loesen = resolve));
		const arbeit = () => drossel.ausfuehren('https://example.test/a', async () => {
			maximum = Math.max(maximum, ++aktiv);
			await sperre;
			aktiv--;
		});
		const alle = Promise.all([arbeit(), arbeit(), arbeit()]);
		await vi.waitFor(() => expect(maximum).toBe(2));
		loesen();
		await alle;
		expect(maximum).toBe(2);
	});

	it('speichert nur geänderten JSON-Inhalt mit Hash', async () => {
		const aufgabe: PollerAufgabe = { id: '1', url: 'https://example.test/a', pfad: 'a', zustand: 'wahlabend', prioritaet: 0, fehler: 0 };
		const erfolg = vi.fn();
		const speicher: PollerSpeicher = {
			faellige: async () => [aufgabe], erfolg, fehler: vi.fn(),
			registryFaellig: async () => false, registryStand: async () => ({}), registrySpeichern: vi.fn(), behoerdenSpeichern: vi.fn()
		};
		const fetchMock = vi.fn(async () => Response.json({ stand: 1 }));
		await new Poller(speicher, { kontakt: 'ops@example.test', backfill: false, globalProSekunde: 1_000, parallelProHost: 2 }, fetchMock as typeof fetch).einmal(new Date('2026-01-01'));
		expect(erfolg).toHaveBeenCalledWith(aufgabe, expect.objectContaining({ geaendert: true, inhalt: { stand: 1 }, hash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
	});

	it('lädt Terminlisten bei gefilterten Probe-Läufen trotz altem ETag neu', async () => {
		const aufgabe: PollerAufgabe = {
			id: '1', url: 'https://example.test/03355/api/termine.json', pfad: 'api/termine.json',
			zustand: 'geplant', prioritaet: 0, fehler: 0, stand: { etag: 'alt' }
		};
		const speicher: PollerSpeicher = {
			faellige: async () => [aufgabe], erfolg: vi.fn(), fehler: vi.fn(),
			registryFaellig: async () => false, registryStand: async () => ({}), registrySpeichern: vi.fn(), behoerdenSpeichern: vi.fn()
		};
		const fetchMock = vi.fn(async (_url, init) => {
			expect(new Headers(init?.headers).get('if-none-match')).toBeNull();
			return Response.json({ termine: [] });
		});
		await new Poller(speicher, {
			kontakt: 'ops@example.test', backfill: true, globalProSekunde: 1_000,
			parallelProHost: 2, wahltage: ['20260913']
		}, fetchMock as typeof fetch).einmal(new Date('2026-01-01'));
		expect(speicher.erfolg).toHaveBeenCalledWith(aufgabe, expect.objectContaining({ geaendert: true }));
	});

	it('normalisiert und validiert die bundesweite Registry', () => {
		expect(parseRegistry({ behoerden: [{ ags: '03355000', name: 'Lüneburg', ort: 'Lüneburg', bundesland: 'NI', url: 'https://example.test/' }] })[0]).toEqual({ ags: '03355000', name: 'Lüneburg', ort: 'Lüneburg', land: 'NI', basisUrl: 'https://example.test/' });
		expect(parseRegistry({ data: [[
			' <a href="https://votemanager.kdo.de/03355001/index.html" >Gemeinde Adendorf</a>',
			'Adendorf', 'Niedersachsen'
		]] })[0]).toEqual({
			'ags': '03355001', name: 'Gemeinde Adendorf', ort: 'Adendorf', land: 'Niedersachsen',
			basisUrl: 'https://votemanager.kdo.de/'
		});
		expect(() => parseRegistry([{ ags: '../x', url: 'http://example.test' }])).toThrow('Ungültige Behörde');
		expect(parseRegistry({ data: [['<a href="https://wahlen.bonn.de/">Stadt Bonn</a>', 'Bonn', 'Nordrhein-Westfalen']] })).toEqual([]);
	});
});
