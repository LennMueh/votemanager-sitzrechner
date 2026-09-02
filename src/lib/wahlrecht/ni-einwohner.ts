/**
 * Einwohnerzahl einer Vertretung finden — die Brücke zwischen votemanager und
 * dem Landesamt für Statistik.
 *
 * Getrennt von `ni-sitzzahl.ts`, weil das dort reines Recht ist und hier reine
 * Schlüsselkunde. Beide Seiten benennen dieselben Kommunen anders:
 *
 *  - **Landkreise** heißen bei votemanager `03355000`, beim LSN `03355`.
 *  - **Gemeinden und Städte** stimmen überein (`03355001`).
 *  - **Samtgemeinden** heißen bei votemanager `033555402`, beim LSN `03355402` —
 *    votemanager schiebt vor die Verbandsnummer eine zusätzliche 5.
 *  - **Mitgliedsgemeinden** haben bei votemanager **gar keine eigene Kennung**;
 *    sie erscheinen nur als `gebiet_name` unter der Samtgemeinde-Behörde. Sie
 *    werden deshalb über den normalisierten Namen innerhalb ihres Landkreises
 *    gesucht — eindeutig, weil ein Kreis keine zwei gleichnamigen Gemeinden hat.
 *
 * Ortsräte (§ 92 NKomVG) und Stadtbezirksräte (§ 93) folgen **nicht** § 46,
 * sondern der Einwohnerzahl der Ortschaft bzw. des Bezirks — und die veröffentlicht
 * keine Statistikbehörde. Für sie gibt es hier bewusst nichts; sie bleiben bei der
 * Bekanntmachung oder der Vorwahl. Ohne diese Ausnahme bekämen die dreizehn
 * hannoverschen Stadtbezirksräte die Einwohnerzahl der ganzen Landeshauptstadt.
 */
import type { Kommunenart } from './ni-sitzzahl';

export interface Einwohnertabelle {
	_stichtag: string;
	_quelle: string;
	gebiete: Record<string, { name: string; einwohner: number }>;
}

/** Ortsrat und Bezirksrat: eigene Vorschriften, keine veröffentlichte Grundzahl. */
const OHNE_STAFFEL = /ortsrat|ortschaftsrat|bezirksrat|stadtbezirk/i;
const DIREKTWAHL = /bürge?rmeister|landrat|stichwahl/i;

const normal = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Gemeindename auf den Kern reduzieren. Das LSN schreibt „Bardowick, Flecken",
 * votemanager „Flecken Bardowick"; die Rechtsform steht mal vorn, mal hinten.
 */
const kern = (text: string) => normal(text)
	.replace(/,\s*(sg|flecken|stadt|hansestadt|bergstadt|landkreis)\b.*$/, '')
	.replace(/\b(landkreis(?:es)?|samtgemeinde|gemeinde|stadt|flecken|hansestadt|bergstadt)\b/g, '')
	.replace(/\W/g, '');

/** Welche Staffel des § 46 auf diese Vertretung anzuwenden ist. */
export function kommunenart(kennung: string, titel: string): Kommunenart | undefined {
	if (OHNE_STAFFEL.test(titel) || DIREKTWAHL.test(titel)) return undefined;
	// Die Region Hannover hat nach § 46 Abs. 3 eine feste Zahl.
	if (/regionsversammlung|region hannover/i.test(titel)) return 'regionHannover';
	if (/kreis/i.test(titel)) return kennung.endsWith('000') ? 'landkreis' : undefined; // Kreiswahl je Gemeinde: keine eigene Vertretung
	if (/samtgemeinde/i.test(titel)) return 'samtgemeinde';
	// Neunstellige Kennung heißt: die Behörde ist eine Samtgemeinde, und diese
	// Wahl ist der Rat einer ihrer Mitgliedsgemeinden.
	return kennung.length === 9 ? 'mitgliedsgemeinde' : 'gemeinde';
}

/** Einwohnerzahl und anzuwendende Staffel — oder nichts, wenn § 46 nicht greift. */
export function einwohnerFuer(
	tabelle: Einwohnertabelle,
	kennung: string,
	titel: string,
	gebietName?: string
): { einwohner: number; art: Kommunenart } | undefined {
	const art = kommunenart(kennung, titel);
	if (!art) return undefined;
	const { gebiete } = tabelle;

	const direkt = art === 'landkreis' ? gebiete[kennung.slice(0, 5)]
		: art === 'samtgemeinde' ? gebiete[kennung.slice(0, 5) + kennung.slice(6)]
		: art === 'regionHannover' ? { einwohner: 0, name: '' }   // Zahl ist fest, § 46 Abs. 3
		: gebiete[kennung];
	if (direkt) return { einwohner: direkt.einwohner, art };

	// Mitgliedsgemeinden und Umbenennungen: über den Namen im selben Landkreis.
	const kreis = kennung.slice(0, 5);
	const gesucht = kern(gebietName ?? "");
	if (!gesucht) return undefined;
	for (const [ags, g] of Object.entries(gebiete)) {
		if (ags.length !== 8 || ags[5] === '4' || !ags.startsWith(kreis)) continue;
		if (kern(g.name) === gesucht) return { einwohner: g.einwohner, art };
	}
	return undefined;
}
