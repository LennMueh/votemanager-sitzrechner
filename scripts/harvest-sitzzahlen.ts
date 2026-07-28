/**
 * Erzeugt src/lib/sitzzahlen.json aus dem amtlichen Endergebnis der
 * Kommunalwahl 2021.
 *
 * Hintergrund: Die Zahl der zu vergebenden Sitze steht nicht im Live-Feed —
 * sie ergibt sich aus § 46 NKomVG nach Einwohnerzahl. Im *Endergebnis* von 2021
 * steht sie aber als „Es wurden N Sitze vergeben." und lässt sich so ernten.
 *
 * Die Werte sind eine Vorbelegung, keine Wahrheit: Einwohnerzahlen können
 * Schwellen überschritten haben. Vor dem 13.09.2026 gegen die Bekanntmachungen
 * der Wahlleitungen prüfen.
 *
 * Aufruf:  npm run harvest
 *
 * Bewusst eigenständig gehalten (eigenes fetch statt Import aus src/lib), damit
 * das Skript ohne Bundler direkt mit node laufen kann.
 */

const BASIS = 'https://votemanager.kdo.de';
const WAHLTAG_2021 = '20210912';

const BEHOERDEN = [
	['03355000', 'Landkreis Lüneburg'],
	['03355001', 'Gemeinde Adendorf'],
	['03355009', 'Stadt Bleckede'],
	['03355022', 'Hansestadt Lüneburg'],
	['03355049', 'Gemeinde Amt Neuhaus'],
	['033555401', 'Samtgemeinde Amelinghausen'],
	['033555402', 'Samtgemeinde Bardowick'],
	['033555403', 'Samtgemeinde Dahlenburg'],
	['033555404', 'Samtgemeinde Gellersen'],
	['033555405', 'Samtgemeinde Ilmenau'],
	['033555406', 'Samtgemeinde Ostheide'],
	['033555407', 'Samtgemeinde Scharnebeck']
] as const;

async function json(pfad: string): Promise<any | undefined> {
	try {
		const a = await fetch(`${BASIS}/${pfad}`);
		return a.ok ? await a.json() : undefined;
	} catch {
		return undefined;
	}
}

const eintraege: Record<string, { sitze: number; behoerde: string; gewaehlte2021: number }> = {};

for (const [ags, behoerde] of BEHOERDEN) {
	const termin = await json(`${WAHLTAG_2021}/${ags}/api/praesentation/termin.json`);
	if (!termin) {
		console.warn(`  ! kein termin.json für ${ags} (${behoerde})`);
		continue;
	}
	for (const w of termin.wahleintraege ?? []) {
		const titel: string = w.wahl.titel;
		// Die Kreiswahl wird nur beim Landkreis selbst geführt.
		if (/kreiswahl/i.test(titel) && ags !== '03355000') continue;

		const erg = await json(
			`${WAHLTAG_2021}/${ags}/api/praesentation/wahl_${w.wahl.id}/ergebnis_${w.gebiet_link.id}_0.json`
		);
		const hinweis: string | undefined = erg?.Komponente?.sitze?.hinweis;
		if (!hinweis) continue; // Direktwahlen haben keine Sitzverteilung

		const sitze = Number.parseInt(hinweis.replace(/\./g, '').match(/(\d+)\s*Sitze/)?.[1] ?? '0', 10);
		if (!sitze) continue;

		eintraege[`${ags}|${titel}`] = {
			sitze,
			behoerde,
			gewaehlte2021: erg.Komponente.sitze.tabelle?.zeilen?.length ?? 0
		};
		const luecke = sitze - (erg.Komponente.sitze.tabelle?.zeilen?.length ?? 0);
		console.log(
			`  ${String(sitze).padStart(3)} Sitze  ${titel}${luecke > 0 ? `   (${luecke} unbesetzt)` : ''}`
		);
	}
}

const ziel = new URL('../src/lib/sitzzahlen.json', import.meta.url);
const inhalt = {
	_hinweis:
		'Aus dem amtlichen Endergebnis 2021 geerntet (npm run harvest). Vor dem 13.09.2026 gegen die Bekanntmachungen der Wahlleitungen prüfen — Einwohnerzahlen können Schwellen nach § 46 NKomVG überschritten haben.',
	_quelle: `${BASIS}/${WAHLTAG_2021}/<ags>/api/praesentation/wahl_<id>/ergebnis_<gebiet>_0.json`,
	_schluessel: '<ags>|<Titel der Wahl aus termin.json>',
	vertretungen: eintraege
};
await (await import('node:fs/promises')).writeFile(ziel, JSON.stringify(inhalt, null, '\t') + '\n');

console.log(`\n${Object.keys(eintraege).length} Vertretungen → src/lib/sitzzahlen.json`);
