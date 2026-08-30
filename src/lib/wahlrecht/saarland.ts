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

import type { Sitzverteilung, Wahlbereich } from '$lib/nkwg';
import { verteileListenwahl, type Listenwahlrecht } from './listenwahl';
import { D_HONDT } from './kern/zuteilung';

/**
 * § 41 Abs. 1 KWG SL: d'Hondt über die Gesamtzahl der gültigen Stimmen im
 * Wahlgebiet, keine Sperrklausel, Losentscheid bei gleichen Höchstzahlen.
 *
 * `personen: 'listenplatz'` ist die Konsequenz aus Abs. 5: es entscheidet die
 * Reihenfolge auf dem Wahlvorschlag. Die amtlichen Endergebnisse im Archiv
 * führen die Gewählten folgerichtig als „Gebietsliste 1", „Gebietsliste 2" …
 * — ohne Stimmenzahl. Während der Auszählung veröffentlicht votemanager diese
 * Reihenfolge nicht, weshalb die Sitze dann namenlos bleiben.
 */
export const SAARLAND: Listenwahlrecht = {
	verfahren: D_HONDT,
	personen: 'listenplatz',
	rechtsgrundlageZuteilung: '§ 41 Abs. 1 S. 2 KWG SL'
};

export function verteileSitzeSaarland(bereiche: Wahlbereich[], sitzeGesamt: number): Sitzverteilung {
	return verteileListenwahl(bereiche, sitzeGesamt, SAARLAND);
}
