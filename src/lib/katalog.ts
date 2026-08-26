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
