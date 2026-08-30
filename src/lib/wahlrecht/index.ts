/**
 * Welches Kommunalwahlrecht gilt wo.
 *
 * Bis hierher entschied ein `if` in daten.ts zwischen Niedersachsen und dem
 * Saarland. Bei neun Ländern im Archiv wird daraus eine Tabelle.
 *
 * Zwei Regeln, an denen sich nichts ändern darf:
 *
 *  - Ist für ein Land **kein** Eintrag hinterlegt, rechnet die Anwendung nicht
 *    und sagt das. Kein stiller Rückfall auf das NKWG.
 *  - `belegt` heißt: gegen amtliche Endergebnisse aus `referenzen/<land>/`
 *    nachgerechnet, Sitze **und** Namen. Alles andere trägt einen sichtbaren
 *    Vorbehalt, auch wenn es plausibel aussieht.
 *
 * Die Verfahrenszuordnung stammt aus der Übersicht von wahlrecht.de, ist aber
 * nicht geglaubt, sondern nachgerechnet: `verfahren.test.ts` stellt alle drei
 * Verfahren gegen die eingefrorenen amtlichen Endergebnisse. Die Trefferzahlen
 * je Land stehen am jeweiligen Eintrag — sie sind der Beleg und zugleich die
 * Arbeitsliste, denn kein Land trifft bisher alle Fälle.
 */

import { verteileSitze, type Sitzverteilung, type Wahlbereich } from '$lib/nkwg';
import { verteileListenwahl, type Listenwahlrecht } from './listenwahl';
import { SAARLAND } from './saarland';
import { HARE_NIEMEYER, SAINTE_LAGUE, type Verfahren } from './kern/zuteilung';

export interface Rechtsstand {
	land: string;
	name: string;
	verfahren: Verfahren;
	verteile(bereiche: Wahlbereich[], sitzeGesamt: number): Sitzverteilung;
	/**
	 * Verteilt das Landesrecht die Sitze über die Wahlbereiche hinweg
	 * zwischenverteilt (§ 37 NKWG)? Nur dann brauchen die Wahlbereiche die
	 * Vollständigkeits-Gegenprobe; sonst genügt das Wahlgebietsergebnis, das
	 * ohnehin alle Wahlvorschläge und Bewerber vollständig enthält.
	 */
	wahlbereiche: boolean;
	/** Mehrheitsregel der Direktwahl (Bürgermeister, Landrat). */
	direktwahl: { schwelle: number; stichwahl: boolean; rechtsgrundlage: string };
	rechtsgrundlage: string;
	/** Gegen amtliche Endergebnisse nachgerechnet? Sonst Vorbehalt in der Oberfläche. */
	belegt: boolean;
	/** Warum noch nicht belegt bzw. was offen ist. */
	vorbehalt?: string;
}

/** Kurzschreibweise für die Länder ohne getrennte Listenstimme. */
function listenwahl(
	land: string,
	name: string,
	recht: Listenwahlrecht,
	rest: Omit<Rechtsstand, 'land' | 'name' | 'verfahren' | 'verteile' | 'rechtsgrundlage'> & { rechtsgrundlage: string }
): Rechtsstand {
	return {
		land,
		name,
		verfahren: recht.verfahren,
		verteile: (bereiche, sitze) => verteileListenwahl(bereiche, sitze, recht),
		...rest
	};
}

const STICHWAHL = (rechtsgrundlage: string) => ({ schwelle: 50, stichwahl: true, rechtsgrundlage });

const LAENDER: Rechtsstand[] = [
	{
		land: 'NI',
		name: 'Niedersachsen',
		verfahren: HARE_NIEMEYER,
		// § 36 Abs. 4 NKWG teilt die Sitze einer Partei nochmals zwischen Liste
		// und Bewerbern — als einziges Land. Deshalb eigene Funktion.
		verteile: verteileSitze,
		direktwahl: STICHWAHL('§ 45g NKWG'),
		rechtsgrundlage: '§§ 36, 37 NKWG',
		wahlbereiche: true,
		belegt: true
	},
	listenwahl(
		'SL',
		'Saarland',
		SAARLAND,
		{
			// Sitze getroffen: d'Hondt 277/304, Sainte-Laguë 169, Hare/Niemeyer 166.
			// Das Saarland ist damit als einziges Land beim Höchstzahlverfahren
			// bestätigt. Die 27 Ausreißer sind offen — Verdacht: Listenverbindungen
			// nach § 41 Abs. 1 S. 3, die der Feed nicht als solche markiert.
			wahlbereiche: false,
			direktwahl: STICHWAHL('§ 57 KSVG'),
			rechtsgrundlage: '§ 41 KWG SL',
			belegt: false,
			vorbehalt:
				'Die Reihenfolge auf den Wahlvorschlägen veröffentlicht die Wahlleitung erst im Endergebnis — die Sitze bleiben bis dahin ohne Namen.'
		}
	),
	// Sitze getroffen: Hare/Niemeyer 75/89, Sainte-Laguë 65, d'Hondt 39.
	// Namen (Personenwahl nach Stimmenzahl) 73/89.
	listenwahl(
		'ST',
		'Sachsen-Anhalt',
		{ verfahren: HARE_NIEMEYER, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 35 KWG LSA' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 47 KWG LSA'), rechtsgrundlage: '§ 35 KWG LSA', belegt: false }
	),
	// Sitze getroffen: Hare/Niemeyer 23/30, Sainte-Laguë 20, d'Hondt 11.
	// Namen aber nur 6/28: die amtliche Liste führt Gewählte als „Bewerber im
	// Wahlbezirk … nach § 63 (4)". Mecklenburg-Vorpommern verteilt innerhalb
	// eines Wahlvorschlags also nicht schlicht nach Stimmenzahl. Bis das geklärt
	// ist, stimmen hier die Sitze je Wahlvorschlag, nicht die Personen.
	listenwahl(
		'MV',
		'Mecklenburg-Vorpommern',
		{ verfahren: HARE_NIEMEYER, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 46 KWG M-V' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 68 KWG M-V'), rechtsgrundlage: '§ 46 KWG M-V', belegt: false }
	),
	// Sitze getroffen: Hare/Niemeyer 56/59, Sainte-Laguë 38, d'Hondt 12.
	// Namen 56/59 — die amtliche Liste führt jede Zeile als „Personenwahl".
	listenwahl(
		'HE',
		'Hessen',
		{ verfahren: HARE_NIEMEYER, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 22 KWG HE' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 42 KWG HE'), rechtsgrundlage: '§ 22 KWG HE', belegt: false }
	),
	// Sitze getroffen: Sainte-Laguë 13/16, Hare/Niemeyer 8, d'Hondt 7. Namen 12/16.
	listenwahl(
		'SN',
		'Sachsen',
		{ verfahren: SAINTE_LAGUE, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 22 KomWG SN' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 44a KomWG SN'), rechtsgrundlage: '§ 22 KomWG SN', belegt: false }
	),
	// Sitze getroffen: Sainte-Laguë 70/72, Hare/Niemeyer 67, d'Hondt 52. Namen 60/72.
	// Die Lücke ist die unechte Teilortswahl: dort stockt das Gesetz die Sitzzahl
	// auf — „Die Sitzzahl wurde von 12 auf 13 aufgestockt" steht wörtlich im
	// Korpus —, und die amtliche Liste schiebt den Teilort als eigene Spalte ein.
	// Die Sitzzahl ist in Baden-Württemberg also Rechenergebnis, nicht Vorgabe.
	listenwahl(
		'BW',
		'Baden-Württemberg',
		{ verfahren: SAINTE_LAGUE, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 25 KomWG BW' },
		{
			wahlbereiche: false,
			direktwahl: { schwelle: 50, stichwahl: false, rechtsgrundlage: '§ 45 GemO BW' },
			rechtsgrundlage: '§ 25 KomWG BW',
			belegt: false,
			vorbehalt:
				'Unechte Teilortswahl und Sitzaufstockung sind noch nicht umgesetzt — bei Gemeinden mit Teilorten kann die Sitzzahl abweichen.'
		}
	),
	// Sitze getroffen: Sainte-Laguë 148/162, Hare/Niemeyer 105, d'Hondt 20.
	// Namen 0: Nordrhein-Westfalen wählt personalisiert — die Direktmandate
	// stehen in eigenen Wahlbezirks-Dokumenten, die übrigen führt die amtliche
	// Liste als „Reservelistenplatz 1". Beides gibt das Wahlgebietsdokument nicht
	// her; die Sitze bleiben deshalb ohne Namen.
	listenwahl(
		'NW',
		'Nordrhein-Westfalen',
		{ verfahren: SAINTE_LAGUE, personen: 'listenplatz', rechtsgrundlageZuteilung: '§ 33 KWahlG NW' },
		{
			wahlbereiche: false,
			direktwahl: { schwelle: 50, stichwahl: false, rechtsgrundlage: '§ 46c KWahlG NW' },
			rechtsgrundlage: '§ 33 KWahlG NW',
			belegt: false,
			vorbehalt:
				'Die Direktmandate aus den Wahlbezirken werden noch nicht gelesen — angezeigt werden nur Sitze je Wahlvorschlag, ohne Namen.'
		}
	)
];

const NACH_LAND = new Map(LAENDER.map((r) => [r.land, r]));

export function rechtsstand(land: string | undefined): Rechtsstand | undefined {
	return land ? NACH_LAND.get(land) : undefined;
}

export function alleRechtsstaende(): Rechtsstand[] {
	return LAENDER;
}
