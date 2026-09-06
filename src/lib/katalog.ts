export interface KatalogEintrag {
	land: string;
	region: string;
	regionName: string;
	ags: string;
	behoerde: string;
	termin: string;
	datum: string;
	instanzId: number;
	wahlId: string;
	gebietId: string;
	gebiet: string;
	wahl: string;
	wahlart: string;
}

export function vorwahl(optionen: string[], aktuell: string): string {
	return optionen.includes(aktuell) ? aktuell : optionen.length === 1 ? optionen[0] : '';
}

/**
 * Freitextsuche über die angezeigten Felder einer Zeile.
 *
 * Alle Suchwörter müssen vorkommen, die Reihenfolge nicht — sonst findet
 * „oedeme ortsrat" nichts, obwohl „Ortsrat Oedeme" dasteht.
 */
export function trifft(felder: (string | undefined)[], suche: string): boolean {
	const worte = suche.toLowerCase().split(/\s+/).filter(Boolean);
	if (!worte.length) return true;
	const text = felder.filter(Boolean).join(' ').toLowerCase();
	return worte.every((w) => text.includes(w));
}
