/**
 * Ereignisse werden gebündelt, statt jedes einzeln nachzuladen.
 *
 * Der Poller archiviert stoßweise: ein Durchlauf schreibt bis zu hundert
 * Dokumente, und jedes davon ist ein Ereignis. Ungebündelt rief die Startseite
 * dadurch gemessene 28-mal in drei Sekunden die vollständige Übersicht ab —
 * gut zwei Megabyte je Abruf, für einen Stand, der sich in dieser Zeit nur
 * einmal sichtbar ändert. Genau das ließ die Seite zäh wirken.
 *
 * Alle Aufrufer laden ohnehin ihren gesamten Stand neu; der zuletzt gemeldete
 * Schlüssel genügt daher als Auslöser.
 */
const BUENDEL_MS = 400;

/** Eine native EventSource-Verbindung; der Server übernimmt Wiederverbindung und Replay. */
export function strom(schluessel: string[], aktualisieren: (schluessel?: string) => void): () => void {
	if (!schluessel.length) return () => {};
	const quellen: EventSource[] = [];
	let uhr: ReturnType<typeof setTimeout> | undefined;
	let letzter: string | undefined;
	const melde = (s?: string) => {
		letzter = s;
		if (uhr !== undefined) return;
		uhr = setTimeout(() => {
			uhr = undefined;
			aktualisieren(letzter);
		}, BUENDEL_MS);
	};
	for (let i = 0; i < schluessel.length; i += 50) {
		const quelle = new EventSource(`/api/strom?abo=${encodeURIComponent(schluessel.slice(i, i + 50).join(','))}`);
		quelle.addEventListener('update', (e) => melde(JSON.parse((e as MessageEvent).data).schluessel));
		quelle.addEventListener('reset', () => melde());
		quellen.push(quelle);
	}
	return () => {
		if (uhr !== undefined) clearTimeout(uhr);
		quellen.forEach((quelle) => quelle.close());
	};
}
