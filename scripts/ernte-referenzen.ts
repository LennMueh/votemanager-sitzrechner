/**
 * Friert amtliche Endergebnisse als Referenzfälle für die Rechenschicht ein.
 *
 * Warum: der stärkste Test des Projekts (alle-vertretungen.test.ts) hängt am
 * Netz. Fällt votemanager aus oder ändert sich ein Pfad, ist er am Wahlabend
 * nicht lauffähig — und jeder Umbauschritt der Rechenschicht dauert Minuten
 * statt Sekunden. Eingefroren läuft dieselbe Prüfung offline.
 *
 * Arbeitsteilung, die dabei entsteht:
 *   - Referenzfälle prüfen die *Rechenschicht*, offline.
 *   - alle-vertretungen.test.ts bleibt bestehen und prüft den *Parser* am Feed.
 * Ein Parserfehler friert sonst mit ein; deshalb bleiben beide.
 *
 * Aufruf:  npm run ernte
 *          npm run ernte -- --wahltag=20210912 --land=ni
 *
 * Bewusst kein eigener Parser: das Skript importiert votemanager.ts, damit
 * Fixture und Anwendung garantiert dasselbe Modell sehen.
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BASIS, holeVertretungen, ladeVertretung } from '../src/lib/votemanager.ts';

const arg = (name: string, standard: string): string =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? standard;

const WAHLTAG = arg('wahltag', '20210912');
const LAND = arg('land', 'ni');
const ZIEL = arg('ziel', 'referenzen');

/** Dateinamentauglich, ohne Umlaute zu verlieren wo es zählt. */
function schnipsel(s: string): string {
	return s
		.toLowerCase()
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);
}

/** Stabile Prüfsumme über den rechenrelevanten Teil — erkennt nachträgliche Änderung. */
function pruefsumme(inhalt: unknown): string {
	return 'sha256:' + createHash('sha256').update(JSON.stringify(inhalt)).digest('hex');
}

const refs = (await holeVertretungen(WAHLTAG)).filter((r) => !r.direktwahl);
console.log(`${refs.length} Vertretungen entdeckt (ohne Direktwahlen)`);

mkdirSync(`${ZIEL}/${LAND}`, { recursive: true });

let geschrieben = 0;
let ohneAmtlich = 0;

for (const ref of refs) {
	const daten = await ladeVertretung(ref, WAHLTAG);
	if (!daten.amtlicheSitze?.anzahl) {
		ohneAmtlich++;
		console.log(`  übersprungen (kein amtliches Ergebnis): ${ref.behoerde} / ${ref.titel}`);
		continue;
	}

	const kennung = `${LAND}/${ref.ags}-${WAHLTAG}-${schnipsel(ref.titel)}`;
	const kern = {
		sitzeGesamt: daten.amtlicheSitze.anzahl,
		bereiche: daten.bereiche,
		amtlich: daten.amtlicheSitze.gewaehlte
	};

	const fixture = {
		kennung,
		quelle: `${BASIS}/${WAHLTAG}/${ref.ags}/api/praesentation/wahl_${ref.wahlId}/ergebnis_${ref.gebietId}_0.json`,
		geerntet: new Date().toISOString().slice(0, 10),
		pruefsumme: pruefsumme(kern),
		land: LAND.toUpperCase(),
		wahltag: WAHLTAG,
		ags: ref.ags,
		behoerde: ref.behoerde,
		titel: ref.titel,
		bezeichnung: `${ref.behoerde} — ${ref.titel}`,
		...kern
	};

	const datei = `${ZIEL}/${kennung}.json.gz`;
	writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify(fixture, null, '\t')), { level: 9 }));
	geschrieben++;
	console.log(
		`  ${kennung}  ${kern.sitzeGesamt} Sitze, ${kern.amtlich.length} gewählt, ${kern.bereiche.length} Wahlbereich(e)`
	);
}

console.log(`\n${geschrieben} Referenzfälle geschrieben, ${ohneAmtlich} ohne amtliches Ergebnis.`);
if (geschrieben < 40) {
	console.error('Zu wenige Fälle — Ernte gilt als fehlgeschlagen.');
	process.exit(1);
}
