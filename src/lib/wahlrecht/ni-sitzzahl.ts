/**
 * § 46 NKomVG — Zahl der Abgeordneten nach Einwohnerzahl.
 *
 * Die Sitzzahl steht nicht im Feed und erscheint erst im amtlichen Endergebnis.
 * Sie folgt aber aus dem Gesetz: § 46 NKomVG staffelt sie nach der Einwohnerzahl,
 * und § 177 Abs. 2 Satz 1 NKomVG sagt, welche Einwohnerzahl gilt — die von der
 * Landesstatistikbehörde aus der Fortschreibung des Zensus 2022 ermittelte Zahl zu
 * einem Stichtag, der mindestens 12 und höchstens 18 Monate vor dem Wahltag liegt.
 * Für den 13.09.2026 ist das landesweit der 30.06.2025.
 *
 * Reine Funktionen ohne I/O, wie `nkwg.ts`: hier liegt juristische Substanz, sie
 * muss ohne Netz und ohne Datenbank prüfbar sein. Die Einwohnerzahlen selbst
 * stehen in `einwohner-ni.json`.
 *
 * **§ 46 Abs. 4 wird bewusst nicht gerechnet.** Die Vertretung kann die Zahl per
 * Satzung um 2, 4 oder 6 senken (Gemeinden und Samtgemeinden über 8.000 Einwohner,
 * Landkreise, Region Hannover; die Zahl 20 darf nicht unterschritten werden). Diese
 * Satzung steht in keinem abrufbaren Datensatz. Wo sie greift, liegt die Rechnung
 * zu hoch — deshalb trägt das Ergebnis einen sichtbaren Vorbehalt, und eine
 * abweichende Bekanntmachung wird als Konflikt gemeldet statt verschluckt.
 */

export type Kommunenart =
	| 'gemeinde'
	| 'mitgliedsgemeinde'
	| 'samtgemeinde'
	| 'landkreis'
	| 'regionHannover';

/**
 * § 46 Abs. 1 NKomVG — Gemeinden und Samtgemeinden.
 *
 * Je Eintrag die **Obergrenze** der Staffel und die Zahl der Abgeordneten. Der
 * letzte Eintrag ist offen („mit mehr als 600 000 Einwohnerinnen und Einwohnern").
 */
const ABS_1: ReadonlyArray<readonly [obergrenze: number, sitze: number]> = [
	[500, 6], [1_000, 8], [2_000, 10], [3_000, 12], [5_000, 14],
	[6_000, 16], [7_000, 18], [8_000, 20], [9_000, 22], [10_000, 24],
	[11_000, 26], [12_000, 28], [15_000, 30], [20_000, 32], [25_000, 34],
	[30_000, 36], [40_000, 38], [50_000, 40], [75_000, 42], [100_000, 44],
	[125_000, 46], [150_000, 48], [175_000, 50], [200_000, 52], [250_000, 54],
	[300_000, 56], [350_000, 58], [400_000, 60], [500_000, 62], [600_000, 64],
	[Infinity, 66]
];

/** § 46 Abs. 2 NKomVG — Landkreise. */
const ABS_2: ReadonlyArray<readonly [obergrenze: number, sitze: number]> = [
	[100_000, 42], [125_000, 46], [150_000, 50], [175_000, 54], [200_000, 58],
	[250_000, 62], [300_000, 64], [350_000, 66], [400_000, 68],
	[Infinity, 70]
];

/** § 46 Abs. 3 NKomVG — „Die Zahl der Regionsabgeordneten beträgt 84." */
const REGION_HANNOVER = 84;

/**
 * Zahl der zu wählenden Abgeordneten nach § 46 Abs. 1–3 NKomVG.
 *
 * In Mitgliedsgemeinden von Samtgemeinden erhöht sich die Zahl aus Absatz 1 um
 * eins — deshalb sind die Sitzzahlen dort ungerade (Flecken Bardowick 2021: 21,
 * also 20 aus der Staffel 7 001–8 000 plus eins).
 *
 * Die Samtgemeinde selbst ist keine Mitgliedsgemeinde und bekommt den Zuschlag
 * nicht (Samtgemeinde Elbmarsch 2021: 30 aus der Staffel 12 001–15 000).
 */
export function sitzzahlNachEinwohnern(einwohner: number, art: Kommunenart): number | undefined {
	if (!Number.isFinite(einwohner) || einwohner < 0) return undefined;
	if (art === 'regionHannover') return REGION_HANNOVER;
	const staffel = art === 'landkreis' ? ABS_2 : ABS_1;
	const treffer = staffel.find(([obergrenze]) => einwohner <= obergrenze);
	if (!treffer) return undefined;
	return treffer[1] + (art === 'mitgliedsgemeinde' ? 1 : 0);
}

/**
 * Welche Staffel getroffen wurde — für den Hinweis an der Zahl.
 * „6 001 bis 7 000" liest sich am Wahlabend besser als eine nackte 19.
 */
export function staffelText(einwohner: number, art: Kommunenart): string | undefined {
	if (art === 'regionHannover') return '§ 46 Abs. 3 NKomVG';
	const staffel = art === 'landkreis' ? ABS_2 : ABS_1;
	const i = staffel.findIndex(([obergrenze]) => einwohner <= obergrenze);
	if (i < 0) return undefined;
	const untergrenze = i === 0 ? 0 : staffel[i - 1][0] + 1;
	const [obergrenze] = staffel[i];
	const absatz = art === 'landkreis' ? 'Abs. 2' : 'Abs. 1';
	return obergrenze === Infinity
		? `§ 46 ${absatz} NKomVG, mehr als ${untergrenze - 1}`
		: `§ 46 ${absatz} NKomVG, ${untergrenze} bis ${obergrenze}`;
}
