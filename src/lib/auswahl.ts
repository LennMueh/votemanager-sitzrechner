/** API-Pfad für neue Instanzschlüssel und bestehende AGS-Lesezeichen. */
export function vertretungPfad(schluessel: string, wahltag = ''): string {
	const [quelle, wahl, gebiet, rest] = schluessel.split(':');
	if (!quelle || !/^\d+$/.test(wahl) || !gebiet || rest !== undefined) throw new Error(`Ungültige Wahlauswahl: ${schluessel}`);
	const parameter = new URLSearchParams({ wahl, gebiet });
	const instanz = quelle.match(/^i(\d+)$/)?.[1];
	if (instanz) parameter.set('instanz', instanz);
	else {
		parameter.set('ags', quelle);
		if (wahltag) parameter.set('wahltag', wahltag);
	}
	return `/api/vertretung?${parameter}`;
}
