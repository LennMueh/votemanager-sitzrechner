/**
 * Friert amtliche Endergebnisse aus dem PostgreSQL-Archiv als Referenzfälle ein.
 *
 * Warum ein zweites Erntesskript neben ernte-referenzen.ts: die Quelle ist eine
 * andere. ernte-referenzen.ts holt aus dem Netz gegen die fest verdrahtete
 * Lüneburger Behördenliste; hier wird gelesen, was der Poller ohnehin schon
 * archiviert hat — neun Länder, Termine bis 2001 zurück. Beides in einem Skript
 * hieße, Netzcode und Datenbankcode zu verheiraten, ohne dass sie sich eine
 * einzige Zeile teilen.
 *
 * **Niedersachsen wird übersprungen.** Dort verteilt § 37 NKWG über Wahlbereiche
 * zwischen; ein Referenzfall braucht deshalb die Wahlbereichs-Dokumente und
 * nicht nur das Wahlgebietsergebnis. Die 53 vorhandenen NI-Fälle stammen aus der
 * Netzernte und sind vollständig — sie hier mit einem Ein-Bereich-Fall zu
 * überschreiben würde den stärksten Test des Projekts stillschweigend entwerten.
 *
 * Aufruf:  DATABASE_URL=… node --experimental-strip-types scripts/ernte-archiv.ts
 *          … --land=HE          nur ein Land
 *          … --ziel=referenzen  Zielverzeichnis
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { db } from '../src/lib/server/db.ts';
import { amtlicheGewaehlte, parseErgebnis } from '../src/lib/votemanager.ts';

const arg = (name: string, standard: string): string =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? standard;

const NUR_LAND = arg('land', '').toUpperCase();
const ZIEL = arg('ziel', 'referenzen');

/** Niedersachsen kommt aus der Netzernte, siehe Kopfkommentar. */
const AUSGENOMMEN = new Set(['NI']);

function schnipsel(s: string): string {
	return s
		.toLowerCase()
		.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '')
		.slice(0, 60);
}

function pruefsumme(inhalt: unknown): string {
	return 'sha256:' + createHash('sha256').update(JSON.stringify(inhalt)).digest('hex');
}

const sql = db();
const zeilen = await sql<Array<{ land: string; kennung: string; behoerde: string; wahltag: string; titel: string; pfad: string; inhalt: unknown }>>`
	SELECT b.land, b.kennung, b.name behoerde, to_char(t.datum,'YYYYMMDD') wahltag, w.name titel, p.pfad, d.inhalt
	FROM wahl w
	JOIN termin t ON t.id=w.termin_id
	JOIN instanz i ON i.id=t.instanz_id
	JOIN behoerde b ON b.id=i.behoerde_id
	JOIN pfad_stand p ON p.instanz_id=i.id
		AND p.pfad LIKE '%/wahl_' || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json'
	JOIN LATERAL (SELECT inhalt FROM dokument d WHERE d.pfad_stand_id=p.id ORDER BY id DESC LIMIT 1) d ON true
	WHERE jsonb_array_length(d.inhalt->'Komponente'->'sitze'->'tabelle'->'zeilen') > 0
	ORDER BY b.land, b.kennung, t.datum, w.name`;

console.log(`${zeilen.length} archivierte Endergebnisse mit amtlicher Sitzverteilung`);

let geschrieben = 0;
const uebersprungen = new Map<string, number>();
const zaehl = (grund: string) => uebersprungen.set(grund, (uebersprungen.get(grund) ?? 0) + 1);

for (const z of zeilen) {
	if (AUSGENOMMEN.has(z.land)) { zaehl(`${z.land} (Netzernte)`); continue; }
	if (NUR_LAND && z.land !== NUR_LAND) continue;

	const erg = parseErgebnis(z.inhalt as never);
	if (!erg.amtlicheSitze?.anzahl) { zaehl(`${z.land}: keine Sitzzahl`); continue; }
	if (!erg.vorschlaege.length) { zaehl(`${z.land}: keine Wahlvorschläge`); continue; }

	// Über die Spaltenüberschriften statt über Positionen: Baden-Württemberg
	// schiebt bei unechter Teilortswahl den Wohnbezirk an zweite Stelle, und der
	// sieht aus wie „Nachname, Vorname".
	const amtlich = amtlicheGewaehlte(erg.amtlicheSitze.spalten, erg.amtlicheSitze.gewaehlte)
		.map((g): [string, string] => [g.partei, g.name]);
	if (amtlich.length !== erg.amtlicheSitze.gewaehlte.length) {
		zaehl(`${z.land}: Gewähltenzeile ohne Namen`);
		continue;
	}

	const kern = {
		sitzeGesamt: erg.amtlicheSitze.anzahl,
		bereiche: [{ id: 'wahlgebiet', name: z.titel, vorschlaege: erg.vorschlaege }],
		amtlich
	};
	const kennung = `${z.land.toLowerCase()}/${z.kennung}-${z.wahltag}-${schnipsel(z.titel)}`;

	mkdirSync(`${ZIEL}/${z.land.toLowerCase()}`, { recursive: true });
	writeFileSync(
		`${ZIEL}/${kennung}.json.gz`,
		gzipSync(
			Buffer.from(JSON.stringify({
				kennung,
				quelle: z.pfad,
				geerntet: new Date().toISOString().slice(0, 10),
				pruefsumme: pruefsumme(kern),
				land: z.land,
				wahltag: z.wahltag,
				ags: z.kennung,
				behoerde: z.behoerde,
				titel: z.titel,
				bezeichnung: `${z.behoerde} — ${z.titel}`,
				...kern
			}, null, '\t')),
			{ level: 9 }
		)
	);
	geschrieben++;
}

console.log(`\n${geschrieben} Referenzfälle geschrieben`);
for (const [grund, n] of [...uebersprungen].sort((a, b) => b[1] - a[1])) {
	console.log(`  übersprungen: ${grund} — ${n}`);
}
await sql.end();
