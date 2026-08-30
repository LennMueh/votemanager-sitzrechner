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

/** Uhrzeit am Wahltag in Ortszeit — der Container läuft mit TZ=Europe/Berlin. */
function uhrzeitAm(wahltag: Date, stunde: number, minute: number): Date {
	const zeitpunkt = new Date(wahltag);
	zeitpunkt.setHours(stunde, minute, 0, 0);
	return zeitpunkt;
}

export function naechsterZustand(aktuell: Zustand, jetzt: Date, signal: Signale): Zustand {
	if (aktuell === 'unerreichbar') return aktuell;
	if (aktuell === 'geplant' || aktuell === 'vorlauf') {
		// Der 30-s-Takt hing bisher allein an strukturGeladen — einem Signal, das
		// nirgends gesetzt wurde. Solange die Pfade fest als 'wahlabend' angelegt
		// wurden, fiel das nicht auf. Deshalb entscheidet das Zeitfenster am
		// echten Wahltag.
		//
		// Der Vorlauf deckt den ganzen Wahltag ab, damit die Kette termin.json →
		// wahl.json → uebersicht → ergebnis vier Ebenen tief durchlaufen ist,
		// bevor die Wahllokale schließen. Mit 24-h-Takt war er wirkungslos.
		if (jetzt >= uhrzeitAm(signal.wahltag, 18, 0)) return 'wahlabend';
		// Frühstart nur im Endspurt: strukturGeladen ist über den ganzen Vorlauf
		// wahr und würde den 30-s-Takt sonst über den halben Tag ziehen.
		if (aktuell === 'vorlauf' && signal.strukturGeladen && jetzt >= uhrzeitAm(signal.wahltag, 17, 45))
			return 'wahlabend';
		if (jetzt >= uhrzeitAm(signal.wahltag, 0, 0)) return 'vorlauf';
		return aktuell;
	}
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
		case 'vorlauf':
			// Der Vorlauf muss die Struktur laden, nicht nur warten: ohne eigenen
			// Takt fiel er auf die 24-h-Vorgabe zurück und holte einmal am Tag.
			return 15 * MINUTE;
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
