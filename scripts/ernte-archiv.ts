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
 * **Niedersachsen wird nach `referenzen/` nie geschrieben.** Die 53 NI-Fälle
 * dort stammen aus der Netzernte und sind vollständig — sie hier zu
 * überschreiben würde den stärksten Test des Projekts stillschweigend
 * entwerten. In jedes andere Ziel (die lokale Vollernte `referenzen-archiv/`)
 * kommt Niedersachsen mit: § 37 NKWG verteilt über Wahlbereiche zwischen, die
 * Wahlbereichs-Dokumente werden deshalb genauso gelesen und gegengeprüft wie in
 * `berechneVertretung()` (daten.ts).
 *
 * Aufruf:  DATABASE_URL=… node --experimental-strip-types scripts/ernte-archiv.ts
 *          … --land=HE                    nur ein Land
 *          … --ziel=referenzen-archiv     Zielverzeichnis (Standard: referenzen)
 */

import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { db } from '../src/lib/server/db.ts';
import { amtlicheGewaehlte, parseErgebnis } from '../src/lib/votemanager.ts';
import type { Wahlvorschlag } from '../src/lib/nkwg.ts';

const arg = (name: string, standard: string): string =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? standard;

const NUR_LAND = arg('land', '').toUpperCase();
const ZIEL = arg('ziel', 'referenzen');

/** Niedersachsen kommt nach referenzen/ aus der Netzernte, siehe Kopfkommentar. */
const AUSGENOMMEN = new Set(ZIEL === 'referenzen' ? ['NI'] : []);

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

const summe = (vs: Wahlvorschlag[]): number =>
	vs.reduce((s, v) => s + v.listenstimmen + v.kandidaten.reduce((a, k) => a + k.stimmen, 0), 0);

const sql = db();
const zeilen = await sql<Array<{ land: string; kennung: string; behoerde: string; wahltag: string; titel: string; pfad: string; inhalt: unknown; instanz_id: number; wahl_id: string; gebiet_id: string }>>`
	SELECT b.land, b.kennung, b.name behoerde, to_char(t.datum,'YYYYMMDD') wahltag, w.name titel, p.pfad, d.inhalt,
		i.id::int instanz_id, w.wahl_id::text, w.gebiet_id
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

/**
 * Wahlbereiche je Wahl, nur für Länder mit Zwischenverteilung (NI). Ein Gebiet
 * ohne archiviertes Dokument bleibt mit `inhalt: null` stehen — die Wahl gilt
 * dann als unvollständig und wird übersprungen, nicht zum Ein-Bereich-Fall.
 */
const teileJeWahl = new Map<string, Array<{ id: string; name: string; inhalt: unknown | null }>>();
if (!AUSGENOMMEN.has('NI') && (!NUR_LAND || NUR_LAND === 'NI')) {
	const teile = await sql<Array<{ instanz_id: number; wahl_id: string; gebiet_id: string; name: string; inhalt: unknown | null }>>`
		SELECT e.instanz_id::int instanz_id, e.wahl_id::text, g.gebiet_id, g.name, d.inhalt
		FROM uebersicht_ebene e
		JOIN instanz i ON i.id=e.instanz_id
		JOIN behoerde b ON b.id=i.behoerde_id
		JOIN gebiet g ON g.uebersicht_ebene_id=e.id
		LEFT JOIN pfad_stand p ON p.instanz_id=e.instanz_id
			AND p.pfad LIKE '%/wahl_' || e.wahl_id || '/ergebnis_' || g.gebiet_id || '_0.json'
		LEFT JOIN LATERAL (SELECT inhalt FROM dokument d WHERE d.pfad_stand_id=p.id ORDER BY id DESC LIMIT 1) d ON true
		WHERE e.art='wahlbereich' AND b.land='NI'`;
	for (const t of teile) {
		const schluessel = `${t.instanz_id}:${t.wahl_id}`;
		if (!teileJeWahl.has(schluessel)) teileJeWahl.set(schluessel, []);
		teileJeWahl.get(schluessel)!.push({ id: t.gebiet_id, name: t.name, inhalt: t.inhalt });
	}
}

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
	const gewaehlte = amtlicheGewaehlte(erg.amtlicheSitze.spalten, erg.amtlicheSitze.gewaehlte);
	if (gewaehlte.length !== erg.amtlicheSitze.gewaehlte.length) {
		zaehl(`${z.land}: Gewähltenzeile ohne Namen`);
		continue;
	}

	// Wahlbereiche wie in holeWahlbereiche() (votemanager.ts): nur wenn sie sich
	// exakt auf das Wahlgebietsergebnis summieren, sonst ein Bereich (§ 36). Ein
	// Ortsrat teilt sich die Wahl-ID mit dem Rat — die Ebene führt dann dessen
	// Wahlbereiche, die mit dem Ortsrat nichts zu tun haben.
	let bereiche = [{ id: 'wahlgebiet', name: z.titel, vorschlaege: erg.vorschlaege }];
	const teile = (teileJeWahl.get(`${z.instanz_id}:${z.wahl_id}`) ?? []).filter((t) => t.id !== z.gebiet_id);
	if (teile.length) {
		if (teile.some((t) => !t.inhalt)) { zaehl(`${z.land}: Wahlbereich ohne Dokument`); continue; }
		const geladen = teile.map((t) => ({ id: t.id, name: t.name, vorschlaege: parseErgebnis(t.inhalt as never).vorschlaege }));
		if (geladen.reduce((s, b) => s + summe(b.vorschlaege), 0) === summe(erg.vorschlaege)) bereiche = geladen;
		else zaehl(`${z.land}: fremde Wahlbereiche, als ein Bereich geerntet`);
	}

	const kern = {
		sitzeGesamt: erg.amtlicheSitze.anzahl,
		bereiche,
		amtlich: gewaehlte.map((g): [string, string] => [g.partei, g.name])
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
				// Nur zur Diagnose, außerhalb der Prüfsumme: Wortlaut der Mandatsspalte
				// („Ausgleichsitz", „Bewerber im Wahlbezirk … nach § 63 (4)" …).
				mandat: gewaehlte.map((g) => g.mandat ?? ''),
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
