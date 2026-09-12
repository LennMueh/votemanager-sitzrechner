import { describe, expect, it } from 'vitest';
import { pruefIntervall, TOR_SICHERUNG_MS, wahllokalNachAbruf } from './zustand';

describe('Wahllokal-Tor', () => {
	it('schickt ein Wahllokal mit Stimmen in den Nachlauf und senkt die Priorität', () => {
		expect(wahllokalNachAbruf('wahlabend', 412)).toEqual({ zustand: 'nachlauf', intervallMs: pruefIntervall('nachlauf'), prioritaet: 60 });
	});

	it('lässt ein Wahllokal ohne Stimmen oder mit 304 wieder am Tor warten', () => {
		const warten = { zustand: 'wahlabend', intervallMs: TOR_SICHERUNG_MS, prioritaet: 60 };
		expect(wahllokalNachAbruf('wahlabend', 0)).toEqual(warten);
		expect(wahllokalNachAbruf('wahlabend', undefined)).toEqual(warten);
		expect(wahllokalNachAbruf('vorlauf', undefined)).toEqual({ ...warten, zustand: 'vorlauf' });
	});

	it('mischt sich außerhalb des Wahlabends nicht ein', () => {
		expect(wahllokalNachAbruf('nachlauf', 412)).toBeUndefined();
		expect(wahllokalNachAbruf('beobachtung', undefined)).toBeUndefined();
		expect(wahllokalNachAbruf('ruhend', 0)).toBeUndefined();
	});

	it('wartet nie im 30-s-Takt', () => {
		expect(TOR_SICHERUNG_MS).toBeGreaterThan(100 * pruefIntervall('wahlabend')!);
	});
});
