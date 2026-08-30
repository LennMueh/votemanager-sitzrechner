import { describe, expect, it, vi } from 'vitest';
import { konfiguration } from './config';
import { Drossel } from './drossel';
import { holeJson, retryAfter } from './http';
import { parseRegistry, Poller, type PollerAufgabe, type PollerSpeicher } from './index';
import { apiWurzel, termineUrl } from './urls';
import { fehlerBackoff, naechsterZustand, pruefIntervall } from './zustand';
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

	it('macht Termine erst am Wahltag selbst heiß', () => {
		const jetzt = new Date('2026-08-30T12:00:00Z');
		// Vorher 'geplant' (24-h-Takt) — nicht 'wahlabend' (30-s-Takt): sonst
		// hängen 658 Pfade zwei Wochen lang an fremder Infrastruktur und
		// verdrängen über die Prioritätssortierung jeden Backfill.
		expect(terminZustand('2026-09-13', jetzt, 'wahlabend')).toBe('geplant');
		expect(terminZustand('2026-08-30', jetzt, 'wahlabend')).toBe('wahlabend');
		expect(terminZustand('2026-08-30', jetzt, 'vorlauf')).toBe('vorlauf');
		expect(terminZustand('2021-09-12', jetzt, 'wahlabend')).toBe('ruhend');
	});

	it('begrenzt Backoff auf 24 Stunden und deaktiviert Backfill', () => {
		expect(fehlerBackoff(1)).toBe(30_000);
		expect(fehlerBackoff(99)).toBe(86_400_000);
		// Host-Backoff: eigener Deckel, Retry-After schlägt ihn.
		expect(fehlerBackoff(1, undefined, 3_600_000)).toBe(30_000);
		expect(fehlerBackoff(7, undefined, 3_600_000)).toBe(1_920_000);
		expect(fehlerBackoff(8, undefined, 3_600_000)).toBe(3_600_000);
		expect(fehlerBackoff(2, 7_200_000, 3_600_000)).toBe(7_200_000);
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
