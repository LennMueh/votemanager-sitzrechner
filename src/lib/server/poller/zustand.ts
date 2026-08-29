export type Zustand =
	| 'geplant'
	| 'vorlauf'
	| 'wahlabend'
	| 'nachlauf'
	| 'beobachtung'
	| 'ruhend'
	| 'unerreichbar';

const MINUTE = 60_000;
const TAG = 24 * 60 * MINUTE;

export interface Signale {
	wahltag: Date;
	strukturGeladen?: boolean;
	vollstaendig?: boolean;
	amtlich?: boolean;
	geaendert?: boolean;
	letzteAenderung?: Date;
}

export function naechsterZustand(aktuell: Zustand, jetzt: Date, signal: Signale): Zustand {
	if (aktuell === 'unerreichbar') return aktuell;
	if (aktuell === 'geplant') {
		const vorlauf = new Date(signal.wahltag);
		vorlauf.setHours(17, 45, 0, 0);
		return jetzt >= vorlauf ? 'vorlauf' : aktuell;
	}
	if (aktuell === 'vorlauf' && signal.strukturGeladen) return 'wahlabend';
	if (aktuell === 'wahlabend' && signal.vollstaendig) return 'nachlauf';
	if (aktuell === 'nachlauf' && signal.amtlich) return 'beobachtung';
	if (
		aktuell === 'beobachtung' &&
		signal.letzteAenderung &&
		jetzt.getTime() - signal.letzteAenderung.getTime() >= 90 * TAG
	)
		return 'ruhend';
	if (aktuell === 'ruhend' && signal.geaendert) return 'beobachtung';
	return aktuell;
}

export function pruefIntervall(zustand: Zustand): number | undefined {
	switch (zustand) {
		case 'wahlabend':
			return 30_000;
		case 'nachlauf':
			return 15 * MINUTE;
		case 'beobachtung':
			return 7 * TAG;
		case 'ruhend':
			return 30 * TAG;
		default:
			return undefined;
	}
}

/** Verdopplung ab 30 s. Ein Retry-After des Anbieters schlägt den Deckel — wir
 *  verkürzen nie, was uns die fremde Infrastruktur ausdrücklich vorgibt. */
export function fehlerBackoff(fehler: number, retryAfterMs?: number, deckel = 24 * 60 * MINUTE): number {
	return Math.max(retryAfterMs ?? 0, Math.min(deckel, 30_000 * 2 ** Math.max(0, fehler - 1)));
}
