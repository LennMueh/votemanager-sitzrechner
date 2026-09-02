/**
 * Zeitplan einer Wahlabend-Wiedergabe — rein, ohne Datenbank und ohne Netz.
 *
 * Der Poller schreibt je Änderung eine Zeile in `dokument`. Ein mitgeschriebener
 * Wahlabend liegt damit fertig im Archiv: die Stände eines Pfades in der
 * Reihenfolge, in der sie erschienen sind. `scripts/wahlabend.ts` spielt sie in
 * eine Schatten-Instanz zurück, und der Rest der Kette (Trigger → NOTIFY → SSE →
 * Oberfläche) läuft unverändert.
 *
 * Hier steckt die einzige Logik, die dabei schiefgehen kann, und deshalb ist sie
 * getrennt und geprüft.
 */

export interface Quellstand {
	/** Pfad-Stand der Quelle — bestimmt, in welchen Schattenpfad der Stand gehört. */
	pfadStandId: number;
	sha256: string;
	erfasstAm: Date;
	inhalt: unknown;
}

export interface Zeitplan {
	/**
	 * Der jeweils erste Stand je Pfad. Er wird ohne Ereignis geschrieben: die
	 * Simulation soll mit einem bebilderten Wahlgebiet anfangen, nicht mit einer
	 * leeren Übersicht.
	 */
	grundzustand: Quellstand[];
	/** Alles danach, in der Reihenfolge des echten Abends. Ein Schritt = ein Takt. */
	schritte: Quellstand[];
}

/**
 * Stände nach Erfassungszeit ordnen und in Grundzustand und Schritte trennen.
 *
 * Inhaltsgleiche Folgestände desselben Pfades fallen weg. Sie sind im Archiv
 * möglich (derselbe Hash kann auf verschiedenen Pfaden liegen, und ein Pfad kann
 * zu einem alten Stand zurückkehren), erzeugten beim Einspielen aber wegen
 * `UNIQUE (pfad_stand_id, sha256)` kein Dokument — der Takt liefe dann leer, und
 * die Wiedergabe hätte stumme Lücken.
 */
export function plane(staende: Quellstand[]): Zeitplan {
	const sortiert = [...staende].sort(
		(a, b) => a.erfasstAm.getTime() - b.erfasstAm.getTime() || a.pfadStandId - b.pfadStandId
	);
	const grundzustand: Quellstand[] = [];
	const schritte: Quellstand[] = [];
	const gesehen = new Map<number, Set<string>>();
	for (const stand of sortiert) {
		let hashes = gesehen.get(stand.pfadStandId);
		if (!hashes) gesehen.set(stand.pfadStandId, (hashes = new Set()));
		if (hashes.has(stand.sha256)) continue;
		hashes.add(stand.sha256);
		(hashes.size === 1 ? grundzustand : schritte).push(stand);
	}
	return { grundzustand, schritte };
}

/**
 * Ereignis-Schlüssel eines Standes — dieselben wie in `db.ts` (`erfolg`).
 * Weichen sie ab, kommt zwar ein NOTIFY an, aber niemand hat es abonniert.
 */
export function schluessel(instanzId: number, pfad: string): string[] {
	const keys = [`${instanzId}:${pfad}`, 'uebersicht'];
	const treffer = pfad.match(/wahl_(\d+)\/ergebnis_(.+)_0\.json$/);
	if (treffer) keys.push(`v:i${instanzId}:${treffer[1]}:${treffer[2]}`);
	return keys;
}
