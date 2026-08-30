import { describe, expect, it } from 'vitest';
import { alsText, monatsraster, naechsterWahltag, verschiebeMonat } from './kalender';

const ohne = new Map<string, number>();

describe('Monatsraster', () => {
	it('beginnt montags und füllt immer sechs Wochen', () => {
		// Der 1.9.2026 ist ein Dienstag — davor muss genau ein Tag aus dem August
		// stehen, sonst rutscht der ganze Monat um eine Spalte.
		const raster = monatsraster(2026, 9, ohne);
		expect(raster).toHaveLength(42);
		expect(raster[0].datum).toBe('20260831');
		expect(raster[0].imMonat).toBe(false);
		expect(raster[1].datum).toBe('20260901');
		expect(raster[1].imMonat).toBe(true);
		expect(raster.filter((t) => t.imMonat)).toHaveLength(30);
	});

	it('kennt Schaltjahre', () => {
		expect(monatsraster(2024, 2, ohne).filter((t) => t.imMonat)).toHaveLength(29);
		expect(monatsraster(2025, 2, ohne).filter((t) => t.imMonat)).toHaveLength(28);
		// 1900 war keins, 2000 schon — die Regel, an der naive Rechnungen scheitern.
		expect(monatsraster(1900, 2, ohne).filter((t) => t.imMonat)).toHaveLength(28);
		expect(monatsraster(2000, 2, ohne).filter((t) => t.imMonat)).toHaveLength(29);
	});

	it('trägt die Zahl der Wahlen ein und lässt den Rest bei null', () => {
		const raster = monatsraster(2026, 9, new Map([['20260913', 1945]]));
		expect(raster.find((t) => t.datum === '20260913')?.wahlen).toBe(1945);
		// Alle anderen Tage des Monats sind nicht anwählbar.
		expect(raster.filter((t) => t.wahlen > 0)).toHaveLength(1);
	});

	it('zeigt über die Jahresgrenze hinweg richtig', () => {
		// Der 1.1.2027 ist ein Freitag: vier Tage aus dem Dezember 2026 davor.
		const raster = monatsraster(2027, 1, ohne);
		expect(raster[0].datum).toBe('20261228');
		expect(raster[4].datum).toBe('20270101');
		// Und der letzte Monat des Jahres läuft ins nächste hinein.
		expect(monatsraster(2026, 12, ohne).at(-1)!.datum.startsWith('2027')).toBe(true);
	});
});

describe('Blättern', () => {
	it('verschiebt Monate über Jahresgrenzen', () => {
		expect(verschiebeMonat(2026, 12, 1)).toEqual({ jahr: 2027, monat: 1 });
		expect(verschiebeMonat(2026, 1, -1)).toEqual({ jahr: 2025, monat: 12 });
		expect(verschiebeMonat(2026, 6, 12)).toEqual({ jahr: 2027, monat: 6 });
		expect(verschiebeMonat(2026, 6, -12)).toEqual({ jahr: 2025, monat: 6 });
	});

	it('springt zum nächsten Wahltag, nicht auf den aktuellen', () => {
		const termine = ['20210912', '20210926', '20240609', '20260830', '20260913'];
		expect(naechsterWahltag(termine, '20210912', 1)).toBe('20210926');
		expect(naechsterWahltag(termine, '20210912', -1)).toBe(undefined);
		expect(naechsterWahltag(termine, '20260913', 1)).toBe(undefined);
		expect(naechsterWahltag(termine, '20250101', -1)).toBe('20240609');
		expect(naechsterWahltag(termine, '20250101', 1)).toBe('20260830');
	});
});

describe('Datumstext', () => {
	it('schreibt deutsch', () => {
		expect(alsText('20260913')).toBe('13.09.2026');
		expect(alsText('')).toBe('');
	});
});
