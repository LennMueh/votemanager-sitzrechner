import { describe, expect, it, vi } from 'vitest';
import { strom } from './strom';

/** Minimale EventSource-Attrappe: der Test braucht nur Zuhörer und close(). */
class Attrappe {
	static offen = 0;
	zuhoerer = new Map<string, (e: unknown) => void>();
	constructor(public url: string) {
		Attrappe.offen++;
	}
	addEventListener(art: string, f: (e: unknown) => void) {
		this.zuhoerer.set(art, f);
	}
	close() {
		Attrappe.offen--;
	}
	sende(schluessel: string) {
		this.zuhoerer.get('update')?.({ data: JSON.stringify({ schluessel }) });
	}
}

function mitAttrappe<T>(lauf: (erzeugte: Attrappe[]) => T): T {
	const erzeugte: Attrappe[] = [];
	const alt = (globalThis as { EventSource?: unknown }).EventSource;
	(globalThis as { EventSource?: unknown }).EventSource = class extends Attrappe {
		constructor(url: string) {
			super(url);
			erzeugte.push(this);
		}
	};
	try {
		return lauf(erzeugte);
	} finally {
		(globalThis as { EventSource?: unknown }).EventSource = alt;
	}
}

describe('strom', () => {
	it('bündelt einen Schwall von Ereignissen zu einem Neuladen', () => {
		vi.useFakeTimers();
		mitAttrappe((erzeugte) => {
			const gerufen: (string | undefined)[] = [];
			const beenden = strom(['uebersicht'], (s) => gerufen.push(s));
			// Ein Poller-Durchlauf schreibt stoßweise viele Dokumente.
			for (let i = 0; i < 30; i++) erzeugte[0].sende(`uebersicht`);
			expect(gerufen).toEqual([]);
			vi.advanceTimersByTime(400);
			expect(gerufen).toEqual(['uebersicht']);
			beenden();
		});
		vi.useRealTimers();
	});

	it('lädt nach einer Pause erneut und meldet den letzten Schlüssel', () => {
		vi.useFakeTimers();
		mitAttrappe((erzeugte) => {
			const gerufen: (string | undefined)[] = [];
			const beenden = strom(['a'], (s) => gerufen.push(s));
			erzeugte[0].sende('a1');
			erzeugte[0].sende('a2');
			vi.advanceTimersByTime(400);
			erzeugte[0].sende('a3');
			vi.advanceTimersByTime(400);
			expect(gerufen).toEqual(['a2', 'a3']);
			beenden();
		});
		vi.useRealTimers();
	});

	it('meldet nach dem Abbau nicht mehr nach', () => {
		vi.useFakeTimers();
		mitAttrappe((erzeugte) => {
			const gerufen: (string | undefined)[] = [];
			const beenden = strom(['a'], (s) => gerufen.push(s));
			erzeugte[0].sende('a1');
			beenden();
			vi.advanceTimersByTime(1000);
			expect(gerufen).toEqual([]);
			expect(Attrappe.offen).toBe(0);
		});
		vi.useRealTimers();
	});

	it('teilt mehr als fünfzig Schlüssel auf mehrere Verbindungen auf', () => {
		mitAttrappe((erzeugte) => {
			const beenden = strom(
				Array.from({ length: 120 }, (_, i) => `k${i}`),
				() => {}
			);
			expect(erzeugte.length).toBe(3);
			beenden();
			expect(Attrappe.offen).toBe(0);
		});
	});
});
