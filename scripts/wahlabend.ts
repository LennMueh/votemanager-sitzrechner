/**
 * Einen mitgeschriebenen Wahlabend aus dem Archiv abspielen.
 *
 * Wozu: die Kette Poller-Schreibweg → Trigger `melde_ereignis` → `pg_notify` →
 * `strom.ts` → SSE → Oberfläche und Präsentationsmodus lässt sich sonst nur an
 * einem echten Wahlabend prüfen. Der Poller schreibt aber jede Änderung als
 * eigene `dokument`-Zeile, und damit liegt im Archiv, was zum Abspielen fehlt:
 * am 30.08.2026 (Saarland, Hessen) bis zu 122 Stände je Ergebnispfad.
 *
 * Geschrieben wird in eine **Schatten-Instanz**: eigene `instanz`/`termin`/
 * `wahl`/`pfad_stand`-Zeilen, erkennbar am Suffix `#simulation` in `termin_url`.
 * Das Archiv bleibt unberührt, und `--aufraeumen` räumt alles über ein einziges
 * DELETE samt ON DELETE CASCADE wieder weg.
 *
 * Das Skript geht bewusst nicht ins Netz — votemanager sieht davon nichts.
 */
import { db, schliesseDb } from '../src/lib/server/db.ts';
import { parseErgebnis } from '../src/lib/votemanager.ts';
import { plane, schluessel, type Quellstand } from '../src/lib/server/wahlabend.ts';

const argument = (name: string) => process.argv.find((x) => x.startsWith(`--${name}=`))?.split('=', 2)[1];
const hat = (name: string) => process.argv.includes(`--${name}`);

const SUFFIX = '#simulation';
const sql = db();

// ---------------------------------------------------------------------------

async function aufraeumen(): Promise<number> {
	const weg = await sql`DELETE FROM instanz WHERE termin_url LIKE ${'%' + SUFFIX} RETURNING id`;
	return weg.length;
}

if (hat('aufraeumen')) {
	console.log(`${await aufraeumen()} Schatten-Instanzen gelöscht.`);
	await schliesseDb();
	process.exit(0);
}

const quelle = argument('quelle') ?? '20260830';
const behoerde = argument('behoerde');
// Zieldatum: an welchem Wahltag die Simulation in der Oberfläche erscheint.
const ziel = argument('datum') ?? new Date().toISOString().slice(0, 10).replace(/-/g, '');
const takt = Number(argument('takt') ?? 4000);
const pruefen = hat('pruefen');

if (!/^\d{8}$/.test(quelle) || !/^\d{8}$/.test(ziel)) throw new Error('--quelle und --datum brauchen YYYYMMDD');
// FRISCH_MS in daten.ts hält Übersicht und Vertretung drei Sekunden fest. Ein
// schnellerer Takt schreibt zwar alles, aber die Oberfläche überspringt Stände.
if (takt > 0 && takt < 3000) console.warn(`⚠  --takt=${takt} liegt unter FRISCH_MS (3000 ms) — die Oberfläche wird Stände überspringen.`);

const alsDatum = (t: string) => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;

// --- Aufbau der Schatten-Instanzen ----------------------------------------

console.log(`Räume alte Simulationen ab: ${await aufraeumen()} gelöscht.`);

const quellInstanzen = await sql<Array<{ id: number; behoerde_id: number; termin_url: string; api_wurzel: string | null; name: string }>>`
	SELECT DISTINCT i.id::int, i.behoerde_id::int, i.termin_url, i.api_wurzel, b.name
	FROM instanz i JOIN termin t ON t.instanz_id=i.id JOIN behoerde b ON b.id=i.behoerde_id
	WHERE t.datum=${alsDatum(quelle)}::date
		AND (${behoerde ?? null}::text IS NULL OR b.kennung=${behoerde ?? null})
	ORDER BY 1`;
if (!quellInstanzen.length) throw new Error(`Keine Instanz für --quelle=${quelle}${behoerde ? ` --behoerde=${behoerde}` : ''}`);

/** Schattenpfad je Quellpfad — Ziel der eingespielten Stände. */
const pfadAbbildung = new Map<number, { id: number; instanzId: number; pfad: string }>();

await sql.begin(async (tx) => {
	for (const q of quellInstanzen) {
		// `zustand='ruhend'` und `naechste_pruefung=NULL`: der echte Poller wählt
		// nur Fällige, die Schatten-URL darf er nie abrufen (sie ist keine).
		const [schatten] = await tx<Array<{ id: number }>>`
			INSERT INTO instanz (behoerde_id, termin_url, api_wurzel, zustand, naechste_pruefung, prioritaet)
			VALUES (${q.behoerde_id}, ${q.termin_url + SUFFIX}, ${q.api_wurzel}, 'ruhend', null, 100)
			RETURNING id::int`;

		await tx`
			INSERT INTO termin (instanz_id, termin_id, name, datum)
			SELECT ${schatten.id}, termin_id, 'Simulation ' || name, ${alsDatum(ziel)}::date
			FROM termin WHERE instanz_id=${q.id}`;
		await tx`
			INSERT INTO wahl (termin_id, wahl_id, gebiet_id, gebiet_name, name, wahlart)
			SELECT nt.id, w.wahl_id, w.gebiet_id, w.gebiet_name, w.name, w.wahlart
			FROM wahl w JOIN termin t ON t.id=w.termin_id
			JOIN termin nt ON nt.instanz_id=${schatten.id} AND nt.termin_id=t.termin_id
			WHERE t.instanz_id=${q.id}`;
		// Wahlbereiche und Gebiete mitnehmen: ohne sie rechnet daten.ts in
		// Niedersachsen keine Verteilung und die Übersicht verliert Gebietsnamen.
		await tx`
			INSERT INTO uebersicht_ebene (instanz_id, wahl_id, ebene_id, name, art)
			SELECT ${schatten.id}, wahl_id, ebene_id, name, art FROM uebersicht_ebene WHERE instanz_id=${q.id}`;
		await tx`
			INSERT INTO gebiet (uebersicht_ebene_id, gebiet_id, name)
			SELECT ne.id, g.gebiet_id, g.name
			FROM gebiet g JOIN uebersicht_ebene e ON e.id=g.uebersicht_ebene_id
			JOIN uebersicht_ebene ne ON ne.instanz_id=${schatten.id} AND ne.wahl_id=e.wahl_id AND ne.ebene_id=e.ebene_id
			WHERE e.instanz_id=${q.id}`;

		const pfade = await tx<Array<{ neu: number; alt: number; pfad: string }>>`
			INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung)
			SELECT ${schatten.id}, p.pfad, 'ruhend', p.prioritaet, null FROM pfad_stand p WHERE p.instanz_id=${q.id}
			RETURNING id::int AS neu, pfad, (SELECT id::int FROM pfad_stand o WHERE o.instanz_id=${q.id} AND o.pfad=pfad_stand.pfad) AS alt`;
		for (const p of pfade) pfadAbbildung.set(p.alt, { id: p.neu, instanzId: schatten.id, pfad: p.pfad });
	}
});
console.log(`${quellInstanzen.length} Schatten-Instanzen mit ${pfadAbbildung.size} Pfaden aufgebaut.`);

// --- Zeitplan --------------------------------------------------------------

const roh = await sql<Array<{ pfad_stand_id: number; sha256: string; erfasst_am: Date; inhalt: unknown }>>`
	SELECT d.pfad_stand_id::int, d.sha256, d.erfasst_am, d.inhalt
	FROM dokument d WHERE d.pfad_stand_id IN ${sql([...pfadAbbildung.keys()])}
	ORDER BY d.erfasst_am, d.id`;
const { grundzustand, schritte } = plane(roh.map((r): Quellstand => ({
	pfadStandId: r.pfad_stand_id, sha256: r.sha256, erfasstAm: r.erfasst_am, inhalt: r.inhalt
})));
console.log(`Zeitplan: ${grundzustand.length} Pfade im Grundzustand, ${schritte.length} Schritte.`);

// --- Einspielen ------------------------------------------------------------

/** Genau das, was db.ts im Erfolgsfall tut — Dokument und die drei Ereignisse. */
async function spiele(stand: Quellstand, mitEreignis: boolean): Promise<void> {
	const ziel = pfadAbbildung.get(stand.pfadStandId);
	if (!ziel) return;
	await sql.begin(async (tx) => {
		const [dokument] = await tx<Array<{ id: string }>>`
			INSERT INTO dokument (pfad_stand_id, sha256, inhalt)
			VALUES (${ziel.id}, ${stand.sha256}, ${tx.json(stand.inhalt as never)})
			ON CONFLICT (pfad_stand_id, sha256) DO NOTHING RETURNING id::text`;
		if (!dokument) return;
		await tx`UPDATE pfad_stand SET zuletzt_geprueft=now(), zuletzt_geaendert=now(), status=200 WHERE id=${ziel.id}`;
		// Dasselbe, was db.ts im Erfolgsfall tut: die Wiedergabe umgeht erfolg(),
		// ohne diesen Zusatz stünde die Sitzzahl während einer Simulation still.
		const wahl = ziel.pfad.match(/wahl_(\d+)\/ergebnis_(.+)_0\.json$/);
		if (wahl) {
			const anzahl = parseErgebnis(stand.inhalt as never).amtlicheSitze?.anzahl;
			if (anzahl) await tx`UPDATE wahl w SET sitze_amtlich=${anzahl}
				FROM termin t WHERE t.id=w.termin_id AND t.instanz_id=${ziel.instanzId}
					AND w.wahl_id=${wahl[1]} AND w.gebiet_id=${wahl[2]}`;
		}
		if (!mitEreignis) return;
		for (const s of schluessel(ziel.instanzId, ziel.pfad)) {
			await tx`INSERT INTO ereignis (schluessel, dokument_id) VALUES (${s}, ${dokument.id})`;
		}
	});
}

for (const stand of grundzustand) await spiele(stand, false);
console.log(`Grundzustand steht. Jetzt ${schritte.length} Schritte im Takt von ${takt} ms:`);
console.log(`  → http://localhost:5173/?wahltag=${ziel}`);

const [{ id: ereignisVorher }] = await sql<Array<{ id: string }>>`SELECT coalesce(max(id),0)::text AS id FROM ereignis`;
let getan = 0;
for (const stand of schritte) {
	await spiele(stand, true);
	getan++;
	if (getan % 10 === 0 || getan === schritte.length) process.stdout.write(`\r  ${getan}/${schritte.length}`);
	if (takt > 0 && getan < schritte.length) await new Promise((f) => setTimeout(f, takt));
}
console.log('\nFertig.');

// --- Prüfung ---------------------------------------------------------------

if (pruefen) {
	const [{ anzahl }] = await sql<Array<{ anzahl: number }>>`
		SELECT count(*)::int AS anzahl FROM ereignis WHERE id > ${ereignisVorher}::bigint`;
	const erwartet = schritte.reduce((summe, s) => {
		const ziel = pfadAbbildung.get(s.pfadStandId);
		return summe + (ziel ? schluessel(ziel.instanzId, ziel.pfad).length : 0);
	}, 0);
	if (anzahl !== erwartet) throw new Error(`Ereignisse: ${anzahl}, erwartet ${erwartet}`);

	// Jeder Schattenpfad muss am Ende auf demselben Stand stehen wie die Quelle.
	const abweichung = await sql<Array<{ pfad: string }>>`
		SELECT p.pfad FROM pfad_stand p
		WHERE p.instanz_id IN (SELECT id FROM instanz WHERE termin_url LIKE ${'%' + SUFFIX})
			AND (SELECT sha256 FROM dokument WHERE pfad_stand_id=p.id ORDER BY id DESC LIMIT 1) IS DISTINCT FROM
				(SELECT sha256 FROM dokument d JOIN pfad_stand o ON o.id=d.pfad_stand_id
					JOIN instanz oi ON oi.id=o.instanz_id
					WHERE oi.termin_url = replace((SELECT termin_url FROM instanz WHERE id=p.instanz_id), ${SUFFIX}, '')
						AND o.pfad=p.pfad ORDER BY d.id DESC LIMIT 1)`;
	if (abweichung.length) throw new Error(`${abweichung.length} Pfade weichen vom Endstand ab, z. B. ${abweichung[0].pfad}`);
	console.log(`✓ ${anzahl} Ereignisse, alle ${pfadAbbildung.size} Pfade auf dem Endstand der Quelle.`);
}

await schliesseDb();
