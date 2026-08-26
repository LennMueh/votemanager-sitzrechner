import { crawlerKontakt } from './http.ts';

export interface PollerKonfiguration {
	kontakt: string;
	backfill: boolean;
	globalProSekunde: number;
	parallelProHost: number;
	regionen?: string[];
	wahltage?: string[];
}

export function konfiguration(env: Record<string, string | undefined> = process.env): PollerKonfiguration {
	return {
		kontakt: crawlerKontakt(env),
		backfill: env.BACKFILL_ENABLED === 'true',
		globalProSekunde: positiveZahl(env.POLLER_REQUESTS_PER_SECOND, 20),
		parallelProHost: positiveZahl(env.POLLER_PARALLEL_PER_HOST, 2),
		regionen: liste(env.POLLER_REGIONEN),
		wahltage: liste(env.POLLER_WAHLTAGE)?.map((x) => x.replaceAll('-', ''))
	};
}

function liste(wert: string | undefined): string[] | undefined {
	const werte = wert?.split(',').map((x) => x.trim()).filter(Boolean);
	return werte?.length ? werte : undefined;
}

function positiveZahl(wert: string | undefined, standard: number): number {
	const zahl = Number(wert ?? standard);
	if (!Number.isFinite(zahl) || zahl <= 0) throw new Error(`Ungültige positive Zahl: ${wert}`);
	return zahl;
}
