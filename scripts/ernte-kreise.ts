/**
 * Erzeugt `src/lib/kreise.json` — Regionalschlüssel der Kreisebene auf ihren Namen.
 *
 * Warum es das braucht: `regionsname()` in `server/daten.ts` leitet den Namen einer
 * Region aus der Kreisbehörde im Feed ab. Liefert votemanager für einen Kreis nur
 * Gemeinden und nicht den Kreis selbst, bleibt der nackte Schlüssel stehen — in der
 * Kachelübersicht stand dann „03353" statt „Landkreis Harburg". Betroffen waren 56
 * von 273 Regionen im Bestand.
 *
 * Quelle ist die amtliche Codeliste „Kreis" des Statistischen Bundesamtes im
 * XRepository. Die gültige Version wird zur Laufzeit aufgelöst, damit das Skript
 * nach einer Gebietsreform nicht auf einen toten Stand zeigt.
 *
 * Aufruf:  npm run kreise
 */

import { writeFile } from 'node:fs/promises';

const CODELISTE = 'urn:de:bund:destatis:bevoelkerungsstatistik:schluessel:kreis';
const ZIEL = new URL('../src/lib/kreise.json', import.meta.url);

/**
 * Kreisfreie Städte stehen als „Flensburg, Stadt" in der Liste, die übrigen
 * Behördennamen der Anwendung als „Stadt Flensburg". Der nachgestellte Zusatz
 * wandert deshalb nach vorn — das deckt Stadt, Landeshauptstadt, Hansestadt und
 * Wissenschaftsstadt in einem Zug ab, ohne sie einzeln aufzuzählen.
 *
 * Sonderformen tragen ihre Art schon im Namen („Region Hannover", „Städteregion
 * Aachen", „Regionalverband Saarbrücken") und bleiben unangetastet. Alles Übrige
 * ist ein Kreis; ob er „Kreis" oder „Landkreis" heißt, ist Landesrecht — nur
 * Schleswig-Holstein (01) und Nordrhein-Westfalen (05) sagen „Kreis".
 */
export function kreisname(schluessel: string, bezeichnung: string): string {
	const zusatz = bezeichnung.match(/^(.+), ([A-Za-zÄÖÜäöü]+)$/);
	if (zusatz) return `${zusatz[2]} ${zusatz[1]}`;
	if (/^(Region|Städteregion|Regionalverband|Kreisverband)\b/.test(bezeichnung)) return bezeichnung;
	return `${['01', '05'].includes(schluessel.slice(0, 2)) ? 'Kreis' : 'Landkreis'} ${bezeichnung}`;
}

async function hole(url: string): Promise<Response> {
	const antwort = await fetch(url, { headers: { 'user-agent': 'votemanager-sitzrechner/0.1 (ernte-kreise)' } });
	if (!antwort.ok) throw new Error(`HTTP ${antwort.status} für ${url}`);
	return antwort;
}

const fassung = await (await hole(`https://www.xrepository.de/api/codeliste/${CODELISTE}/gueltigeVersion`)).text();
const version = fassung.match(/<[a-z]+:version>([^<]+)</)?.[1];
if (!version) throw new Error('Keine gültige Version in der Antwort des XRepository gefunden');

const daten = (await (await hole(
	`https://www.xrepository.de/api/xrepository/${CODELISTE}_${version}/download/Kreis_${version}.json`
)).json()) as { daten: [string, string, string | null][] };

const kreise = Object.fromEntries(
	daten.daten
		.filter(([schluessel]) => /^\d{5}$/.test(schluessel))
		.map(([schluessel, bezeichnung]) => [schluessel, kreisname(schluessel, bezeichnung)])
		.sort(([a], [b]) => a.localeCompare(b))
);

const anzahl = Object.keys(kreise).length;
if (anzahl < 300) throw new Error(`Nur ${anzahl} Kreise gelesen — das sieht nach einer kaputten Quelle aus`);

await writeFile(ZIEL, `${JSON.stringify({ stand: version, kreise }, null, '\t')}\n`);
console.log(`${anzahl} Kreise, Stand ${version} → src/lib/kreise.json`);
