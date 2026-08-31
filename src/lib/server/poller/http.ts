export interface AbrufStand {
	etag?: string;
	lastModified?: string;
}

export type Abruf =
	| { geaendert: false; stand: AbrufStand }
	| { geaendert: true; stand: AbrufStand; inhalt: unknown };

export function crawlerKontakt(env: Record<string, string | undefined> = process.env): string {
	const kontakt = env.CRAWLER_CONTACT?.trim();
	if (!kontakt) throw new Error('CRAWLER_CONTACT ist erforderlich');
	return kontakt;
}

export async function holeJson(
	url: string,
	stand: AbrufStand = {},
	optionen: { kontakt?: string; fetch?: typeof fetch } = {}
): Promise<Abruf> {
	const headers = new Headers({
		accept: 'application/json',
		'user-agent': `votemanager-sitzrechner/0.1 (${optionen.kontakt ?? crawlerKontakt()})`
	});
	if (stand.etag) headers.set('if-none-match', stand.etag);
	if (stand.lastModified) headers.set('if-modified-since', stand.lastModified);
	const antwort = await (optionen.fetch ?? fetch)(url, { headers });
	const neu = {
		etag: antwort.headers.get('etag') ?? stand.etag,
		lastModified: antwort.headers.get('last-modified') ?? stand.lastModified
	};
	if (antwort.status === 304) return { geaendert: false, stand: neu };
	if (!antwort.ok) {
		// Der Statuscode wird mitgeführt, nicht nur in den Text geschrieben: weiter
		// oben muss unterscheidbar sein, ob der Server „gibt es nicht" sagt (404,
		// 410) oder ob er gerade nicht kann. Ohne diese Unterscheidung wird ein
		// dauerhaft toter Pfad wie ein Ausfall behandelt — mit Backoff und einer
		// Sperre des ganzen Hosts, den sich alle Behörden teilen.
		const fehler = new Error(`HTTP ${antwort.status} für ${url}`) as AbrufFehler;
		fehler.status = antwort.status;
		fehler.retryAfterMs = retryAfter(antwort.headers.get('retry-after'));
		throw fehler;
	}
	const typ = antwort.headers.get('content-type') ?? '';
	return { geaendert: true, stand: neu, inhalt: typ.includes('json') || !url.endsWith('.js') ? await antwort.json() : await antwort.text() };
}

/** Fehler eines Abrufs, mit dem Statuscode der Antwort. */
export interface AbrufFehler extends Error {
	status?: number;
	retryAfterMs?: number;
}

/**
 * Endgültige Antwort: die Ressource gibt es nicht und wird es nicht geben.
 *
 * Das ist kein Ausfall, sondern eine korrekte Auskunft eines funktionierenden
 * Servers. Die Nachernte läuft historische Wahltermine zurück, und viele der
 * dabei gebildeten Pfade hat es nie gegeben — im Archiv sind 9921 von 10687
 * Pfadfehlern genau das.
 */
export const endgueltig = (fehler: unknown): boolean =>
	(fehler as AbrufFehler)?.status === 404 || (fehler as AbrufFehler)?.status === 410;

export function retryAfter(wert: string | null, jetzt = Date.now()): number | undefined {
	if (!wert) return undefined;
	const sekunden = Number(wert);
	if (Number.isFinite(sekunden)) return Math.max(0, sekunden * 1000);
	const datum = Date.parse(wert);
	return Number.isNaN(datum) ? undefined : Math.max(0, datum - jetzt);
}
