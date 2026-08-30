/**
 * Sitzverteilung nach saarländischem Kommunalwahlrecht.
 *
 * Reine Rechenlogik, kein I/O — wie nkwg.ts, damit direkt testbar.
 *
 * Maßgeblich ist § 41 KWG (Saarland), für die Regionalversammlung des
 * Regionalverbands Saarbrücken über § 209 KSVG entsprechend anzuwenden.
 *
 * Zwei Unterschiede zu Niedersachsen prägen die ganze Datei:
 *
 *  1. **d'Hondt statt Hare/Niemeyer.** Das Saarland ist das einzige Land, das
 *     bei Kommunalwahlen noch das Höchstzahlverfahren anwendet
 *     (§ 41 Abs. 1 S. 1). Eine Sperrklausel gibt es seit dem 20.08.2008 nicht
 *     mehr; die frühere Fünf-Prozent-Hürde wurde nach BVerfG zu
 *     Schleswig-Holstein gestrichen.
 *
 *  2. **Reine Listenwahl mit geschlossenen Listen.** Ein Wähler hat eine Stimme
 *     für einen Wahlvorschlag, kein Kumulieren, kein Panaschieren. Es gibt
 *     deshalb keine Kandidatenstimmen — und votemanager veröffentlicht im
 *     Saarland während der Auszählung **keine Bewerbernamen**. Diese Funktion
 *     kann daher nur Sitze je Wahlvorschlag ausweisen, keine Personen.
 *
 * Bewusst NICHT umgesetzt:
 *
 *  - **§ 41 Abs. 3** (zwei Drittel der Sitze eines Wahlvorschlags auf seine
 *    Bereichslisten, der Rest auf die Gebietsliste), **Abs. 4** (Weitergabe,
 *    wenn eine Liste zu kurz ist) und **Abs. 5** (Reihenfolge auf dem
 *    Wahlvorschlag). Alle drei brauchen die Bewerberlisten und die
 *    Unterscheidung Bereichs-/Gebietsliste; beides liefert der Feed nicht.
 *    Am hier angezeigten Ergebnis — Sitze je Wahlvorschlag — ändert die
 *    Unterverteilung nichts.
 *  - **Listenverbindungen** (§ 41 Abs. 1 S. 3 u. 4): erst gemeinsam zuteilen,
 *    dann unterverteilen. Der Feed markiert Verbindungen nicht; sollte einmal
 *    eine antreten, rechnet diese Funktion sie als getrennte Vorschläge und
 *    liegt damit falsch. Dann gehört die Verbindung ins Eingabemodell.
 */

import { stimmenverhaeltnis, type Losfall, type Sitz, type Sitzverteilung, type Wahlbereich } from '$lib/nkwg';
import { zuteilen, D_HONDT } from './kern/zuteilung';

/**
 * § 41 Abs. 1 KWG SL — Sitze auf die Wahlvorschläge nach d'Hondt, im Verhältnis
 * der Gesamtzahl der gültigen Stimmen im ganzen Wahlgebiet.
 *
 * `bereiche` darf ein einzelner Eintrag für das Wahlgebiet sein oder die
 * Wahlbereiche; summiert wird ohnehin über alle.
 */
export function verteileSitzeSaarland(bereiche: Wahlbereich[], sitzeGesamt: number): Sitzverteilung {
	const stimmen = stimmenverhaeltnis(bereiche);
	const stimmenJePartei = new Map(stimmen.parteien.map((p) => [p.partei, p.stimmen]));

	const verteilung = zuteilen(stimmenJePartei, sitzeGesamt, D_HONDT);

	const losentscheide: string[] = [];
	const losfaelle: Losfall[] = [];
	if (verteilung.grenzfall) {
		// § 41 Abs. 1 S. 2: „Über die Zuteilung des letzten Sitzes oder der letzten
		// Sitze entscheidet bei gleichen Höchstzahlen das … zu ziehende Los."
		// Eine Partei kann mit mehreren Höchstzahlen betroffen sein — für die
		// Anzeige interessiert nur, wer beteiligt ist.
		const betroffene = [...new Set(verteilung.grenzfall.betroffene)];
		const losfall: Losfall = {
			kontext: 'Sitzverteilung auf die Wahlvorschläge',
			betroffene,
			sitze: verteilung.grenzfall.sitze,
			vorlaeufig: betroffene.slice(0, verteilung.grenzfall.sitze),
			rechtsgrundlage: '§ 41 Abs. 1 S. 2 KWG SL',
			text: 'Losentscheid bei gleichen Höchstzahlen um den letzten Sitz (§ 41 Abs. 1 S. 2 KWG SL)'
		};
		losfaelle.push(losfall);
		losentscheide.push(losfall.text);
	}

	const parteien = stimmen.parteien.map((p) => ({
		partei: p.partei,
		parteiLang: p.parteiLang,
		farbe: p.farbe,
		stimmen: p.stimmen,
		prozent: p.prozent,
		sitze: verteilung.sitze.get(p.partei) ?? 0
	}));

	// Ein Sitz-Eintrag je Sitz, aber ohne `name`: das Sitzdiagramm zeichnet
	// damit korrekt, und die Tabelle der Gewählten bleibt sichtbar leer, statt
	// Namen zu erfinden, die der Feed nicht hergibt.
	const sitze: Sitz[] = [];
	for (const p of parteien) {
		for (let i = 0; i < p.sitze; i++) {
			sitze.push({
				partei: p.partei,
				parteiLang: p.parteiLang,
				farbe: p.farbe,
				art: 'liste',
				mandat: 'Liste'
			});
		}
	}

	return {
		sitzeGesamt,
		gueltigeStimmen: stimmen.stimmenGesamt,
		parteien: parteien.sort((a, b) => b.sitze - a.sitze || b.stimmen - a.stimmen),
		sitze,
		losentscheide,
		losfaelle
	};
}
