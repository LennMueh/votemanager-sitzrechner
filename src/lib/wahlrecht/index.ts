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
 *    nachgerechnet, Sitze **und** Namen, Fall für Fall. Die übrigen Länder
 *    halten eine Quote, die nur steigen darf; sichtbar wird nur, was ihre
 *    Rechnung nicht kann (`vorbehalt`).
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
	/**
	 * Vorschrift, nach der die Vertretung ihre eigene Sitzzahl per Beschluss
	 * ändern kann. Eine solche Satzung steht in keinem Datensatz — solange die
	 * Sitzzahl nicht amtlich bestätigt ist, bleibt sie deshalb eine begründete
	 * Erwartung. Leer lassen, wo nicht nachgeschlagen: lieber der allgemeine Satz
	 * als ein erfundener Paragraph.
	 */
	sitzzahlBeschluss?: string;
	/** Fall für Fall gegen amtliche Endergebnisse nachgerechnet? Sonst gilt eine Quote (referenzen/quoten.json). */
	belegt: boolean;
	/** Was die Rechnung nicht kann — steht in der Oberfläche. */
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
		// § 46 Abs. 4 NKomVG: Gemeinden über 8.000 Einwohnern, Landkreise und die
		// Region Hannover können die Zahl der Abgeordneten um 2, 4 oder 6 senken;
		// Beschluss spätestens 18 Monate vor Ende der Wahlperiode, Untergrenze 20.
		sitzzahlBeschluss: '§ 46 Abs. 4 NKomVG (Verringerung um 2, 4 oder 6)',
		wahlbereiche: true,
		belegt: true
	},
	listenwahl(
		'SL',
		'Saarland',
		SAARLAND,
		{
			// Sitze getroffen: d'Hondt 277/304, Sainte-Laguë 169, Hare/Niemeyer 166;
			// im Archiv (12.09.2026) 296/323. Das Saarland ist damit als einziges
			// Land beim Höchstzahlverfahren bestätigt. Die 27 Ausreißer sind keine
			// Listenverbindungen: in 15 ist die amtliche Liste kürzer als die
			// Sitzzahl (zu kurze Wahlvorschläge, Sitze unbesetzt — die Bewerberzahl
			// steht nicht im Feed), in 11 trat nur ein Wahlvorschlag an und der
			// Feed führt die Personen statt der Liste (Ortsrat Bachem 2024).
			wahlbereiche: false,
			direktwahl: STICHWAHL('§ 57 KSVG'),
			rechtsgrundlage: '§ 41 KWG SL',
			belegt: false,
			vorbehalt:
				'Die Reihenfolge auf den Wahlvorschlägen veröffentlicht die Wahlleitung erst im Endergebnis — die Sitze bleiben bis dahin ohne Namen.'
		}
	),
	// Sitze getroffen: Hare/Niemeyer 75/89, Sainte-Laguë 65, d'Hondt 39.
	// Namen (Personenwahl nach Stimmenzahl) 85/89, im Archiv (12.09.2026) 845/900.
	// Überzählige Sitze gehen an die übrigen Wahlvorschläge: das heilt 99 Fälle
	// von 2024/25 und bricht 11 von 2019 — dort blieben sie noch unbesetzt. Das
	// Recht hat sich dazwischen geändert; gerechnet wird nach dem neuen.
	listenwahl(
		'ST',
		'Sachsen-Anhalt',
		{ verfahren: HARE_NIEMEYER, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 35 KWG LSA', ueberzaehligeSitze: 'weitergeben' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 47 KWG LSA'), rechtsgrundlage: '§ 35 KWG LSA', belegt: false }
	),
	// Sitze getroffen: Hare/Niemeyer 23/30, Sainte-Laguë 20, d'Hondt 11.
	// Im Archiv (12.09.2026) 370/458 mit Namen. § 63 Abs. 4 LKWG M-V vergibt
	// nach Stimmenzahl — die frühere Namenslücke (6/28) war der Parser: der Feed
	// setzt Wahlbereich oder Wahlbezirk vor den Namen („Wahlbereich Datzetal: …").
	// Überzählige Sitze gehen an die übrigen Wahlvorschläge (39 Fälle geheilt,
	// keiner gebrochen).
	listenwahl(
		'MV',
		'Mecklenburg-Vorpommern',
		{ verfahren: HARE_NIEMEYER, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 63 LKWG M-V', ueberzaehligeSitze: 'weitergeben' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 68 KWG M-V'), rechtsgrundlage: '§ 63 LKWG M-V', belegt: false }
	),
	// Sitze getroffen: Hare/Niemeyer 56/59, Sainte-Laguë 38, d'Hondt 12.
	// Namen 56/59 — die amtliche Liste führt jede Zeile als „Personenwahl".
	// Im Archiv (12.09.2026) 928/941, die Kommunalwahl vom 15.03.2026 mit
	// Hare/Niemeyer 523/527 gegen d'Hondt 291: die Umstellung auf d'Hondt
	// (§ 22 Abs. 3 KWG i. d. F. GVBl. 2025 Nr. 24) galt dort noch nicht. Vor der
	// nächsten hessischen Wahl prüfen, ab wann sie greift.
	listenwahl(
		'HE',
		'Hessen',
		{ verfahren: HARE_NIEMEYER, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 22 KWG HE', ueberzaehligeSitze: 'weitergeben' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 42 KWG HE'), rechtsgrundlage: '§ 22 KWG HE', belegt: false }
	),
	// Sitze getroffen: Sainte-Laguë 13/16, Hare/Niemeyer 8, d'Hondt 7. Namen 14/16,
	// im Archiv (12.09.2026) 198/208. Überzählige Sitze gehen an die übrigen
	// Wahlvorschläge (23 Fälle geheilt, keiner gebrochen) — obwohl der abgerufene
	// Wortlaut von § 21 Abs. 3 KomWG „bleiben unbesetzt" lautet. Offen.
	listenwahl(
		'SN',
		'Sachsen',
		{ verfahren: SAINTE_LAGUE, personen: 'stimmen', rechtsgrundlageZuteilung: '§ 21 KomWG SN', ueberzaehligeSitze: 'weitergeben' },
		{ wahlbereiche: false, direktwahl: STICHWAHL('§ 44a KomWG SN'), rechtsgrundlage: '§ 21 KomWG SN', belegt: false }
	),
	// Sitze getroffen: Sainte-Laguë 70/72, Hare/Niemeyer 67, d'Hondt 52. Namen 60/72.
	// Die Lücke ist die unechte Teilortswahl: dort stockt das Gesetz die Sitzzahl
	// auf — „Die Sitzzahl wurde von 12 auf 13 aufgestockt" steht wörtlich im
	// Korpus —, und die amtliche Liste schiebt den Teilort als eigene Spalte ein.
	// Die Sitzzahl ist in Baden-Württemberg also Rechenergebnis, nicht Vorgabe.
	// Im Archiv (12.09.2026) 3.108/3.721: 443 Ausreißer sind Namen bei unechter
	// Teilortswahl (Mandat „Gewählt"), 43 Ausgleichssitze. Den Wohnbezirk je
	// Bewerber führt der Feed nicht — beides bleibt Vorbehalt. Überzählige Sitze
	// weiterzugeben heilt 5 und bricht 2 Fälle desselben Wahltags; das ist kein
	// Beleg, deshalb bleiben sie hier unbesetzt.
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
	// Im Archiv (12.09.2026) 831/949. Von den 118 Ausreißern zeigen 9 einen
	// Überhang (mehr Direktmandate als Sainte-Laguë-Sitze), 34 treffen ein anderes
	// Verfahren, 75 sind ungeklärt. Ohne die Direktmandate aus den
	// Wahlbezirks-Dokumenten ist der Überhangausgleich nicht zu rechnen.
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
