export type Zustand =
	| 'geplant'
	| 'vorlauf'
	| 'wahlabend'
	| 'nachlauf'
	| 'beobachtung'
	// Einmalige Nachernte einer vergangenen Wahl. Ruhende Pfade prüfen alle 30
	// Tage; die Kette termine.json → app.js → termin.json → ergebnis hat vier
	// Glieder und braucht damit vier Monate bis zum ersten Vorwahl-Ergebnis. Für
	// die Sitzzahl der Vorwahl ist das zu spät. `nachernte` holt genau einmal und
	// fällt danach zurück auf `ruhend`.
	| 'nachernte'
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

/** Tage nach dem Wahltag, an denen ein Pfad den Wahlabend spätestens verlässt. */
const WAHLABEND_ENDE_TAGE = 1;
/** … und den Nachlauf, falls nie ein amtliches Endergebnis erscheint. */
const NACHLAUF_ENDE_TAGE = 7;

/** Uhrzeit am Wahltag in Ortszeit — der Container läuft mit TZ=Europe/Berlin. */
function uhrzeitAm(wahltag: Date, stunde: number, minute: number): Date {
	const zeitpunkt = new Date(wahltag);
	zeitpunkt.setHours(stunde, minute, 0, 0);
	return zeitpunkt;
}

/** Beginn des Tages `tage` nach dem Wahltag, in Ortszeit. */
function nachTagen(wahltag: Date, tage: number): Date {
	const zeitpunkt = new Date(wahltag);
	zeitpunkt.setDate(zeitpunkt.getDate() + tage);
	zeitpunkt.setHours(6, 0, 0, 0);
	return zeitpunkt;
}

export function naechsterZustand(aktuell: Zustand, jetzt: Date, signal: Signale): Zustand {
	if (aktuell === 'unerreichbar') return aktuell;
	// Ein Nachernte-Pfad ist mit dem ersten erfolgreichen Abruf erledigt — diese
	// Funktion wird nur nach einem solchen aufgerufen. Danach gilt wieder der
	// 30-Tage-Takt, und die Beförderung greift nicht erneut, weil sie nur Pfade
	// ohne bisherigen Status auswählt.
	if (aktuell === 'nachernte') return 'ruhend';
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
	// Beide Übergänge hingen allein an einem Signal aus dem Dokument. Für
	// Wahlbezirks-Ergebnisse gibt es diese Signale nie: ihr `hinweis` ist [null],
	// also bleibt `vollstaendig` falsch, und eine amtliche Sitzverteilung tragen
	// sie ohnehin nicht. 351 solcher Pfade wurden nach der Wahl vom 30.08.2026
	// noch tagelang im 30-s-Takt abgefragt — Dauerlast auf fremder Infrastruktur
	// für eine längst ausgezählte Wahl.
	//
	// Deshalb zusätzlich eine Zeitgrenze: der Wahlabend ist ein Abend, kein
	// Dauerzustand. Das Signal bleibt der schnelle Weg, die Uhr der sichere.
	if (aktuell === 'wahlabend') {
		if (signal.vollstaendig) return 'nachlauf';
		if (jetzt >= nachTagen(signal.wahltag, WAHLABEND_ENDE_TAGE)) return 'nachlauf';
	}
	if (aktuell === 'nachlauf') {
		if (signal.amtlich) return 'beobachtung';
		if (jetzt >= nachTagen(signal.wahltag, NACHLAUF_ENDE_TAGE)) return 'beobachtung';
	}
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
		// Kurz, damit ein Glied der Kette nicht auf das nächste wartet. Das Tempo
		// begrenzt nicht dieses Intervall, sondern die Quote in faellige().
		case 'nachernte':
			return 5 * MINUTE;
		case 'ruhend':
			return 30 * TAG;
		default:
			return undefined;
	}
}

/**
 * Frist nach einer endgültigen Auskunft (404/410).
 *
 * fehlerBackoff() gibt beim ersten Fehler 30 Sekunden — richtig für einen
 * Ausfall, falsch für ein „gibt es nicht". Die Nachernte läuft historische
 * Termine zurück und bildet dabei zwangsläufig Pfade, die es nie gab; über den
 * 24-Stunden-Deckel kamen davon 10.514 täglich erneut in die Auswahl und
 * belegten die Vorratsscheibe vollständig, während die Nachernte leer lag.
 *
 * Derselbe Takt wie bei ruhenden Pfaden: der Zustand 'unerreichbar' bleibt, der
 * Rückweg über einen erfolgreichen Abruf bleibt — nur eben monatlich.
 */
export const ENDGUELTIG_MS = 30 * 24 * 60 * MINUTE;

/** Verdopplung ab 30 s. Ein Retry-After des Anbieters schlägt den Deckel — wir
 *  verkürzen nie, was uns die fremde Infrastruktur ausdrücklich vorgibt. */
export function fehlerBackoff(fehler: number, retryAfterMs?: number, deckel = 24 * 60 * MINUTE): number {
	return Math.max(retryAfterMs ?? 0, Math.min(deckel, 30_000 * 2 ** Math.max(0, fehler - 1)));
}
