import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { parseErgebnis } from '../votemanager.ts';
import type { Behoerde, PollerAufgabe, PollerSpeicher } from './poller/index.ts';
import { apiWurzel, termineUrl } from './poller/urls.ts';
import { fehlerBackoff, naechsterZustand, pruefIntervall, type Zustand } from './poller/zustand.ts';

let verbindung: ReturnType<typeof postgres> | undefined;

export function db() {
	if (!verbindung) {
		const url = process.env.DATABASE_URL;
		if (!url) throw new Error('DATABASE_URL fehlt');
		verbindung = postgres(url, { max: Number(process.env.DATABASE_POOL_SIZE ?? 10) });
	}
	return verbindung;
}

export async function schliesseDb(): Promise<void> {
	await verbindung?.end();
	verbindung = undefined;
}

export async function pollerSperre(): Promise<() => Promise<void>> {
	const reserviert = await db().reserve();
	const [{ frei }] = await reserviert<{ frei: boolean }[]>`SELECT pg_try_advisory_lock(826174514) AS frei`;
	if (!frei) {
		await reserviert.release();
		throw new Error('Ein anderer Poller hält bereits die Singleton-Sperre');
	}
	return async () => {
		await reserviert`SELECT pg_advisory_unlock(826174514)`;
		await reserviert.release();
	};
}

export async function migriere(verzeichnis = resolve(process.cwd(), 'migrationen')): Promise<void> {
	const dateien = (await readdir(verzeichnis)).filter((datei) => /^\d+_.+\.sql$/.test(datei)).sort();
	const migrationen = await Promise.all(
		dateien.map(async (datei) => ({ datei, sql: await readFile(resolve(verzeichnis, datei), 'utf8') }))
	);

	await db().begin(async (tx) => {
		await tx`SELECT pg_advisory_xact_lock(826174513)`;
		await tx`CREATE TABLE IF NOT EXISTS schema_migration (
			datei text PRIMARY KEY,
			ausgefuehrt_am timestamptz NOT NULL DEFAULT now()
		)`;
		const erledigt = new Set((await tx<{ datei: string }[]>`SELECT datei FROM schema_migration`).map((x) => x.datei));
		for (const migration of migrationen) {
			if (erledigt.has(migration.datei)) continue;
			await tx.unsafe(migration.sql);
			await tx`INSERT INTO schema_migration (datei) VALUES (${migration.datei})`;
		}
	});
}

export async function erstellePollerSpeicher(
	optionen: { wahltage?: string[]; regionen?: string[]; sofort?: boolean } = {}
): Promise<PollerSpeicher> {
	const sql = db();
	if (optionen.sofort && optionen.regionen?.length) {
		await sql`UPDATE pfad_stand p SET naechste_pruefung=now()
			FROM instanz i JOIN behoerde b ON b.id=i.behoerde_id
			WHERE p.instanz_id=i.id AND p.pfad LIKE '%/api/termine.json'
				AND b.regionalschluessel IN ${sql(optionen.regionen)}`;
	}
	return {
		async faellige(limit, backfill) {
			// Eine kleine Scheibe geht immer an den ältesten fälligen Pfad, egal
			// wie kalt er ist. Sonst hungert termine.json (Prio 10) am Wahlabend —
			// und genau darüber wird die Stichwahl am 27.09. entdeckt.
			const reserve = Math.max(1, Math.floor(limit / 10));
			// Zweite feste Scheibe für die Nachernte. Eine harte Obergrenze statt
			// eines Rangs: nur so ist die Last auf fremder Infrastruktur ablesbar,
			// egal wie viele tausend Pfade fällig sind. Am Wahlabend fällt sie unten
			// auf null.
			const nachernte = Math.max(1, Math.floor(limit / 10));
			const zeilen = await sql<
				Array<{
					id: string;
					pfad: string;
					instanz_id: number;
					basis: string;
					zustand: PollerAufgabe['zustand'];
					prioritaet: number;
					etag: string | null;
					last_modified: string | null;
					fehler_anzahl: number;
					zuletzt_geaendert: Date | null;
					zustand_vor_fehler: Zustand | null;
					termin_datum: string | null;
					struktur_geladen: boolean;
				}>
			>`
			-- Der Host je Instanz, einmal statt je Zeile. Vorher stand der Ausdruck
			-- in der JOIN-Bedingung gegen host_stand; weil ein Ausdruck als
			-- Join-Bedingung keinen Hash zulässt, wurde daraus eine Nested Loop mit
			-- 1.508.285 verworfenen Zeilenpaaren, jedes mit einem Regex — 11,4 der
			-- 17,6 Sekunden, die diese Abfrage brauchte.
			--
			-- Der Instanz-Host genügt: alle 553.306 archivierten Pfade sind absolut,
			-- und bei keinem einzigen weicht sein Host von dem der Instanz ab. Er ist
			-- damit dasselbe, was new URL(pfad, basis).host in der Zeilenabbildung
			-- unten ergibt — nur ohne Regex je Zeile.
			WITH instanzhost AS (
				SELECT i.id, substring(coalesce(i.api_wurzel, i.termin_url) FROM '^https?://([^/]+)') AS host
				FROM instanz i
			),
			gesperrt AS (SELECT host FROM host_stand WHERE naechster_abruf > now()),
			-- Nur was für Filter und Rangfolge gebraucht wird. Alles Abgeleitete
			-- kommt unten für die rund hundert ausgewählten Zeilen, nicht für die
			-- 52.216 fälligen: termin_datum allein war ein Subplan mit 52.216
			-- Schleifendurchläufen, um hundert Werte zu behalten.
			faellig AS (SELECT p.id, p.zustand, p.prioritaet, p.naechste_pruefung,
				-- prioritaet ist statisch, der Zustand nicht: ein Ergebnispfad von
				-- 2021 behält seine 85 für immer und schlug damit die termin.json
				-- der laufenden Wahl. Der Zustand entscheidet deshalb zuerst.
				--
				-- 'geplant' steht neben 'nachlauf' und nicht bei 'beobachtung':
				-- beide hatten Rang 1 und Priorität 45, und von den 22.855 fälligen
				-- beobachtung-Pfaden war jeder älter als der älteste geplante. Über
				-- den Stichentscheid naechste_pruefung bekam 'geplant' dadurch null
				-- von hundert Plätzen — bei 5.845 fälligen, über Stunden unverändert.
				-- Darüber läuft die Entdeckung neuer Termine. Der Rang beendet sich
				-- selbst: ein Pfad verlässt 'geplant' mit dem ersten Erfolg.
				CASE p.zustand WHEN 'wahlabend' THEN 4 WHEN 'vorlauf' THEN 3
					WHEN 'nachlauf' THEN 2 WHEN 'geplant' THEN 2
					WHEN 'ruhend' THEN 0 WHEN 'unerreichbar' THEN 0 WHEN 'nachernte' THEN 0
					ELSE 1 END AS rang
			FROM pfad_stand p JOIN instanz i ON i.id = p.instanz_id
			JOIN behoerde b ON b.id = i.behoerde_id
			JOIN instanzhost ih ON ih.id = i.id
			WHERE b.aktiv AND p.naechste_pruefung <= now() AND (${backfill} OR p.zustand <> 'ruhend')
				AND NOT EXISTS (SELECT 1 FROM gesperrt g WHERE g.host = ih.host)
				-- Korreliert auf die Instanz: unkorreliert hieß das „irgendwo läuft
				-- eine Wahl" und sperrte jeden Backfill, solange auch nur ein Pfad
				-- live war. Zwei Wochen lang war das dauerhaft der Fall.
				AND (p.zustand NOT IN ('ruhend', 'nachernte') OR NOT EXISTS (
					SELECT 1 FROM pfad_stand live WHERE live.instanz_id = p.instanz_id
						AND live.zustand IN ('vorlauf', 'wahlabend')
				))),
			-- An einem Wahltag ruht die Nachernte vollständig und ihre Scheibe fällt an
			-- die Hauptauswahl zurück. Sie ist Vorratsarbeit für den nächsten Wahltag
			-- und darf dem laufenden weder Plätze noch Bandbreite beim gemeinsamen
			-- Host nehmen.
			--
			-- Maßgeblich ist das Datum, nicht der Zustand 'wahlabend'. Mit dem
			-- Zustand als Kriterium hing die Nachernte an einem Signal, das manche
			-- Dokumente nie liefern: Wahlbezirks-Ergebnisse tragen keinen
			-- Auszählstand, blieben nach dem 30.08.2026 dauerhaft im Wahlabend und
			-- hätten die Nachernte damit für immer abgeschaltet — 5.770 wartende
			-- Pfade und kein einziger geholter.
			takt AS (SELECT CASE WHEN EXISTS (SELECT 1 FROM termin WHERE datum = current_date)
				THEN 0 ELSE ${nachernte} END AS quote),
			-- Unerreichbare Pfade zählen zur Vorratsarbeit, nicht zur Hauptauswahl.
			-- Es sind über zehntausend, die überwiegend dauerhaft 404 liefern; in der
			-- Hauptauswahl belegten sie Plätze und die zwei Drossel-Slots je Host,
			-- scheiterten erneut und sperrten den Host für die lebenden Pfade gleich
			-- mit. Ganz aussperren wäre falsch: ein Pfad verlässt diesen Zustand
			-- ausschließlich über einen erfolgreichen Abruf (siehe dokumentZustand).
			auswahl AS (
				(SELECT id FROM faellig WHERE zustand NOT IN ('nachernte', 'unerreichbar')
					ORDER BY rang DESC, prioritaet DESC, naechste_pruefung
					LIMIT (SELECT ${limit - reserve} - quote FROM takt))
				UNION
				(SELECT id FROM faellig WHERE zustand NOT IN ('nachernte', 'unerreichbar')
					ORDER BY naechste_pruefung LIMIT ${reserve})
				UNION
				(SELECT id FROM faellig WHERE zustand IN ('nachernte', 'unerreichbar')
					ORDER BY prioritaet DESC, naechste_pruefung LIMIT (SELECT quote FROM takt)))
			SELECT p.id::text, p.pfad, p.instanz_id, coalesce(i.api_wurzel, i.termin_url) AS basis,
				p.zustand, p.prioritaet, p.etag, p.last_modified, p.fehler_anzahl,
				p.zuletzt_geaendert, p.zustand_vor_fehler,
				-- Kein JOIN termin: 115 Instanzen tragen zwei Termine, das würde
				-- Zeilen vervielfachen. Auswahlregel wie waehleStandardtermin():
				-- der nächste noch anstehende Termin, sonst der letzte vergangene.
				(SELECT to_char(t.datum, 'YYYY-MM-DD') FROM termin t WHERE t.instanz_id = i.id
					ORDER BY (t.datum < current_date), abs(t.datum - current_date) LIMIT 1) AS termin_datum,
				EXISTS (SELECT 1 FROM pfad_stand w WHERE w.instanz_id = i.id
					AND w.pfad LIKE '%/wahl.json' AND w.status IS NOT NULL) AS struktur_geladen
			FROM auswahl a JOIN pfad_stand p ON p.id = a.id
			JOIN instanz i ON i.id = p.instanz_id`;
			return zeilen.map((z) => ({
				id: z.id,
				url: new URL(z.pfad, z.basis.endsWith('/') ? z.basis : `${z.basis}/`).href,
				instanzId: z.instanz_id,
				pfad: z.pfad,
				zustand: z.zustand,
				prioritaet: z.prioritaet,
				stand: { etag: z.etag ?? undefined, lastModified: z.last_modified ?? undefined },
				fehler: z.fehler_anzahl,
				backfill: z.zustand === 'ruhend',
				letzteAenderung: z.zuletzt_geaendert ?? undefined,
				zustandVorFehler: z.zustand_vor_fehler ?? undefined,
				terminDatum: z.termin_datum ?? undefined,
				strukturGeladen: z.struktur_geladen
			}));
		},

		async erfolg(aufgabe, ergebnis) {
			if (aufgabe.instanzId === undefined) throw new Error('Poller-Aufgabe ohne Instanz');
			const instanzId = aufgabe.instanzId;
			const zustand = dokumentZustand(aufgabe, ergebnis.inhalt, ergebnis.geprueft, ergebnis.geaendert);
			const intervall = pruefIntervall(zustand) ?? 24 * 60 * 60_000;
			await sql.begin(async (tx) => {
				await tx`INSERT INTO host_stand (host, fehler_anzahl, naechster_abruf, zuletzt_erreichbar, letzter_fehler)
					VALUES (${new URL(aufgabe.url).host}, 0, null, ${ergebnis.geprueft}, null)
					ON CONFLICT (host) DO UPDATE SET fehler_anzahl=0, naechster_abruf=null,
						zuletzt_erreichbar=excluded.zuletzt_erreichbar, letzter_fehler=null, aktualisiert_am=now()`;
				await tx`UPDATE pfad_stand SET
					etag = ${ergebnis.stand.etag ?? null}, last_modified = ${ergebnis.stand.lastModified ?? null},
					zuletzt_geprueft = ${ergebnis.geprueft},
					zuletzt_geaendert = CASE WHEN ${ergebnis.geaendert} THEN ${ergebnis.geprueft} ELSE zuletzt_geaendert END,
					naechste_pruefung = ${new Date(ergebnis.geprueft.getTime() + intervall)},
					fehler_anzahl = 0, status = ${ergebnis.geaendert ? 200 : 304}, fehler = null,
					zustand = ${zustand}, zustand_vor_fehler = null
				WHERE id = ${aufgabe.id}`;
				await tx`UPDATE instanz SET zustand=${zustand}, naechste_pruefung=${new Date(ergebnis.geprueft.getTime() + intervall)} WHERE id=${instanzId}`;
				if (!ergebnis.geaendert || !ergebnis.hash || ergebnis.inhalt === undefined) return;
				const [dokument] = await tx<{ id: string }[]>`
					INSERT INTO dokument (pfad_stand_id, sha256, inhalt)
					VALUES (${aufgabe.id}, ${ergebnis.hash}, ${tx.json(ergebnis.inhalt as never)})
					ON CONFLICT (pfad_stand_id, sha256) DO NOTHING RETURNING id::text`;
				if (dokument) {
					await tx`INSERT INTO ereignis (schluessel, dokument_id)
						VALUES (${`${instanzId}:${aufgabe.pfad}`}, ${dokument.id}), ('uebersicht', ${dokument.id})`;
					const treffer = aufgabe.pfad.match(/wahl_(\d+)\/ergebnis_(.+)_0\.json$/);
					if (treffer) {
						await tx`INSERT INTO ereignis (schluessel, dokument_id)
							VALUES (${`v:i${instanzId}:${treffer[1]}:${treffer[2]}`}, ${dokument.id})`;
					}
				}
				// Auch ein bereits bekannter Hash muss seine Struktur erneut anwenden
				// dürfen: Filter können zwischen zwei Probe-Läufen geändert worden sein.
				if (aufgabe.pfad.endsWith('api/termine.json')) {
					const alleTermine = (ergebnis.inhalt as { termine?: TerminEintrag[] }).termine ?? [];
					const termine = filtereTermine(alleTermine, optionen.wahltage);
					const [quelle] = await tx<{ behoerde_id: number }[]>`SELECT behoerde_id FROM instanz WHERE id=${instanzId}`;
					for (const t of termine) {
						const terminUrl = new URL(t.url, new URL('../', aufgabe.url)).href;
						const [instanz] = await tx<{ id: number }[]>`INSERT INTO instanz (behoerde_id, termin_url) VALUES (${quelle.behoerde_id}, ${terminUrl}) ON CONFLICT (behoerde_id, termin_url) DO UPDATE SET aktualisiert_am=now() RETURNING id`;
						const datum = deutschesDatum(t.date);
						await tx`INSERT INTO termin (instanz_id, termin_id, name, datum) VALUES (${instanz.id}, ${datum}, ${t.name}, ${datum}) ON CONFLICT (instanz_id, termin_id) DO UPDATE SET name=excluded.name, datum=excluded.datum`;
						const pruefung = ergebnis.geprueft;
						await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung)
							VALUES (${instanz.id}, ${new URL('js/app.js', terminUrl).href}, ${terminZustand(datum, ergebnis.geprueft)}, 40, ${pruefung})
							ON CONFLICT (instanz_id, pfad) DO UPDATE SET naechste_pruefung=excluded.naechste_pruefung`;
					}
				} else if (aufgabe.pfad.endsWith('js/app.js') && typeof ergebnis.inhalt === 'string') {
					const wurzel = apiWurzel(aufgabe.url.replace(/js\/app\.js$/, ''), ergebnis.inhalt);
					await tx`UPDATE instanz SET api_wurzel=${wurzel} WHERE id=${instanzId}`;
					await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${new URL('termin.json', wurzel).href}, ${aufgabe.zustand === 'ruhend' || aufgabe.zustand === 'geplant' || aufgabe.zustand === 'nachernte' ? aufgabe.zustand : 'vorlauf'}, 60, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
				} else if (aufgabe.pfad.endsWith('termin.json')) {
					const roh = ergebnis.inhalt as { datum_string?: string; wahleintraege?: Array<{ wahl: { id: number; titel: string }; gebiet_link: { id: string; title: string } }> };
					const datum = deutschesDatum(roh.datum_string ?? '');
					const [termin] = await tx<{ id: number }[]>`SELECT id FROM termin WHERE instanz_id=${instanzId} AND datum=${datum}::date LIMIT 1`;
					const [instanz] = await tx<{ api_wurzel: string }[]>`SELECT api_wurzel FROM instanz WHERE id=${instanzId}`;
					if (termin && instanz?.api_wurzel) for (const w of roh.wahleintraege ?? []) {
						await tx`INSERT INTO wahl (termin_id, wahl_id, gebiet_id, gebiet_name, name) VALUES (${termin.id}, ${String(w.wahl.id)}, ${w.gebiet_link.id}, ${w.gebiet_link.title}, ${w.wahl.titel}) ON CONFLICT (termin_id, wahl_id, gebiet_id) DO UPDATE SET name=excluded.name, gebiet_name=excluded.gebiet_name`;
						// Das Gesamtergebnis steht über allen Unter-Gebieten: ohne dieses
						// eine Dokument bricht berechneVertretung() mit „Wahlgebietsergebnis
						// fehlt noch" ab. Vorher lag es mit 80 unter den 85 der Übersicht.
						for (const [pfad, prio] of [[`wahl_${w.wahl.id}/wahl.json`, 80], [`wahl_${w.wahl.id}/ergebnis_${w.gebiet_link.id}_0.json`, 90]] as const) {
							// Die Nachernte will genau ein Dokument je Wahl: das
							// Gesamtergebnis mit der amtlichen Sitzzahl. wahl.json führt
							// nur zu Übersichten und Wahlbezirken, die für eine Sitzzahl
							// nichts beitragen — es bleibt ruhend und spart pro Wahl einen
							// Abruf plus die Pfade, die daraus entstünden.
							const kindZustand = aufgabe.zustand === 'nachernte'
								? (prio === 90 ? 'nachernte' : 'ruhend')
								: aufgabe.zustand === 'ruhend' ? 'ruhend' : terminZustand(datum, ergebnis.geprueft);
							await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${new URL(pfad, instanz.api_wurzel).href}, ${kindZustand}, ${prio}, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
						}
					}
				} else if (/wahl_\d+\/wahl\.json$/.test(aufgabe.pfad)) {
					const menu = (ergebnis.inhalt as { menu_links?: Array<{ id: string; type: string; title: string }> }).menu_links ?? [];
					const wahlId = aufgabe.pfad.match(/wahl_(\d+)\/wahl\.json$/)![1];
					for (const m of menu.filter((x) => x.type === 'uebersicht')) {
						const art = /wahlbereich/i.test(m.title) ? 'wahlbereich' : /wahlbezirk|stimmbezirk/i.test(m.title) ? 'wahlbezirk' : 'sonstige';
						await tx`INSERT INTO uebersicht_ebene (instanz_id, wahl_id, ebene_id, name, art)
							VALUES (${instanzId}, ${wahlId}, ${m.id}, ${m.title}, ${art})
							ON CONFLICT (instanz_id, wahl_id, ebene_id) DO UPDATE SET name=excluded.name, art=excluded.art`;
						const url = new URL(`uebersicht_${m.id}_0.json`, aufgabe.url.replace(/wahl\.json$/, ''));
						// Die Stimmbezirks-Ebene erzeugt hunderte Pfade im 30-s-Takt, die
						// die Rechenschicht nie liest. Niedrige Priorität begrenzt sich
						// selbst: wird die Übersicht am Wahlabend nicht geholt, entstehen
						// ihre Ergebnispfade gar nicht erst.
						//
						// Bewusst nur 'wahlbezirk' herunterstufen, nicht alles außer
						// 'wahlbereich': von 254 Ebenen sind nur 2 als 'wahlbereich'
						// erkannt, 35 heißen „Mitgliedsgemeinden". Ob das bei Samtgemeinden
						// die Wahlbereiche nach § 36 sind, ist offen — bis dahin bleiben
						// sie heiß, statt die Gegenprobe zu riskieren.
						await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${url.href}, ${zustand}, ${art === 'wahlbezirk' ? 45 : 75}, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
					}
				} else if (/wahl_\d+\/uebersicht_.+_0\.json$/.test(aufgabe.pfad)) {
					const zeilen = (ergebnis.inhalt as { tabelle?: { zeilen?: Array<{ name?: string; title?: string; link?: { id?: string; title?: string } }> } }).tabelle?.zeilen ?? [];
					const treffer = aufgabe.pfad.match(/wahl_(\d+)\/uebersicht_(.+)_0\.json$/)!;
					const [ebene] = await tx<{ id: number; art: string }[]>`SELECT id, art FROM uebersicht_ebene
						WHERE instanz_id=${instanzId} AND wahl_id=${treffer[1]} AND ebene_id=${treffer[2]}`;
					for (const z of zeilen) if (z.link?.id) {
						if (ebene) await tx`INSERT INTO gebiet (uebersicht_ebene_id, gebiet_id, name)
							VALUES (${ebene.id}, ${z.link.id}, ${z.link.title ?? z.title ?? z.name ?? z.link.id})
							ON CONFLICT (uebersicht_ebene_id, gebiet_id) DO UPDATE SET name=excluded.name`;
						const url = new URL(`ergebnis_${z.link.id}_0.json`, aufgabe.url.replace(/uebersicht_.+_0\.json$/, ''));
						await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${url.href}, ${zustand}, ${ebene?.art === 'wahlbezirk' ? 45 : 85}, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
					}
				}
			});
		},

		async fehler(aufgabe, fehler, naechstePruefung, endgueltig = false, hostBelasten = !endgueltig) {
			const host = new URL(aufgabe.url).host;
			await sql.begin(async (tx) => {
				// `status` wird bewusst NICHT genullt. Die Spalte bedeutet „zuletzt
				// erfolgreich geholt, mit diesem Code"; der Fehlschlag steht in
				// `fehler` und `fehler_anzahl`. Genullt machte sie `status IS NULL`
				// mehrdeutig — und genau daran prüft nachernteBefoerdern, ob ein Pfad
				// schon geerntet wurde. Ein einziger Fehler ließ einen längst
				// geernteten Pfad wieder als „nie geholt" gelten, worauf ihn die
				// Nachernte alle fünf Minuten erneut beförderte. Aus demselben Grund
				// kippte `strukturGeladen` (siehe faellige) nach einem Fehlschlag
				// zurück und schaltete den Frühstart in den Wahlabend ab.
				//
				// `zuletzt_geprueft` wird auch im Fehlerfall gesetzt: sonst steht dort
				// der letzte Erfolg, und jede Betriebsdiagnose über diese Spalte hält
				// täglich angefasste Pfade für nie geprüft.
				//
				// Bei einer endgültigen Antwort (404/410) wird der Pfad sofort
				// stillgelegt, statt fünf Versuche gegen eine Ressource zu verbrauchen,
				// die es nicht gibt.
				const schwelle = endgueltig ? 1 : 5;
				await tx`UPDATE pfad_stand SET fehler_anzahl = fehler_anzahl + 1,
					fehler = ${String(fehler)}, naechste_pruefung = ${naechstePruefung},
					zuletzt_geprueft = now(),
					zustand_vor_fehler = CASE WHEN fehler_anzahl + 1 >= ${schwelle} AND zustand <> 'unerreichbar' THEN zustand ELSE zustand_vor_fehler END,
					zustand = CASE WHEN fehler_anzahl + 1 >= ${schwelle} THEN 'unerreichbar' ELSE zustand END
				WHERE id = ${aufgabe.id}`;

				// Ein 404 ist die korrekte Auskunft eines funktionierenden Servers und
				// darf ihn nicht sperren. Die Nachernte läuft historische Termine
				// zurück und bildet dabei zwangsläufig Pfade, die es nie gab; im
				// Archiv sind das 9921 von 10687 Pfadfehlern. Angerechnet sperrten sie
				// den Host — und schlossen damit auch die lebenden Pfade desselben
				// Hosts aus, deren Erfolg die Sperre gelöst hätte.
				if (!hostBelasten) return;

				const [stand] = await tx<{ fehler_anzahl: number }[]>`
					INSERT INTO host_stand (host, fehler_anzahl, letzter_fehler)
					VALUES (${host}, 1, ${String(fehler)}) ON CONFLICT (host) DO UPDATE SET
					fehler_anzahl=host_stand.fehler_anzahl+1,
					letzter_fehler=excluded.letzter_fehler, aktualisiert_am=now()
					RETURNING fehler_anzahl`;
				// Der Host sperrt sich selbst nach seinem eigenen Zähler, nicht nach
				// dem des zuletzt gescheiterten Pfads. Deckel eine Stunde, damit ein
				// behobener Ausfall nicht halbe Tage nachwirkt. now() ist die Uhr,
				// gegen die faellige() vergleicht.
				//
				// Der Pfad-Backoff darf hier nicht mehr einfließen: greatest(…,
				// naechstePruefung) ließ die 24 h eines einzelnen Pfades den ganzen
				// Host sperren — und votemanager.kdo.de ist der Host aller 3143
				// Behörden. Der Poller stand dann bis zu einen Tag, und kein Abruf
				// konnte die Sperre lösen, weil dafür ein Abruf nötig gewesen wäre.
				// Nur ein ausdrückliches Retry-After des Anbieters schlägt den Deckel.
				const retryAfterMs = (fehler as { retryAfterMs?: number }).retryAfterMs ?? 0;
				const sperre = Math.max(fehlerBackoff(stand.fehler_anzahl, undefined, 60 * 60_000), retryAfterMs);
				await tx`UPDATE host_stand
					SET naechster_abruf = now() + make_interval(secs => ${sperre / 1000})
					WHERE host = ${host}`;
			});
		},

		/**
		 * Befördert die Kette einer vergangenen Wahl auf `nachernte`.
		 *
		 * Wozu: die Sitzzahl der Vorwahl steht im Gesamtergebnis des letzten
		 * Wahltags derselben Körperschaft. Als ruhende Pfade bräuchte die Kette
		 * termine.json → app.js → termin.json → ergebnis vier Monate — 30 Tage je
		 * Glied. Für einen Wahltag, der bevorsteht, ist das zu spät.
		 *
		 * Drei Bedingungen halten die Menge klein und die Abfrage selbstbeendend:
		 *
		 *  - nur vergangene Termine von Behörden, die überhaupt eine Wahl vor sich
		 *    haben — für alle anderen ist die Vorwahl uninteressant;
		 *  - nur die drei Pfadarten der Kette, nicht Übersichten und Wahlbezirke;
		 *  - nur `status IS NULL`, also nie erfolgreich geholt. Damit ist die
		 *    Abfrage idempotent: was einmal geholt wurde, fällt auf `ruhend` und
		 *    wird nie wieder befördert.
		 */
		async nachernteBefoerdern(jetzt) {
			const zeilen = await sql<{ anzahl: number }[]>`
				WITH befoerdert AS (
					-- greatest statt hart auf jetzt: sonst holt die Beförderung alle
					-- fünf Minuten genau die Pfade zurück auf „sofort fällig", die der
					-- Fehlerpfad gerade sorgfältig vertagt hat. Der Backoff war gegen
					-- die Beförderung wirkungslos.
					UPDATE pfad_stand p SET zustand = 'nachernte',
						naechste_pruefung = greatest(coalesce(p.naechste_pruefung, ${jetzt}), ${jetzt})
					FROM instanz i
					WHERE i.id = p.instanz_id
						AND p.zustand = 'ruhend'
						AND p.status IS NULL
						-- Ein Pfad, der schon einmal gescheitert ist, gehört nicht in
						-- die Vorratsarbeit: er läuft über den Fehler-Backoff.
						AND p.fehler_anzahl = 0
						AND (p.pfad LIKE '%js/app.js' OR p.pfad LIKE '%termin.json' OR p.prioritaet = 90)
						AND EXISTS (SELECT 1 FROM termin t WHERE t.instanz_id = i.id AND t.datum < current_date)
						AND EXISTS (SELECT 1 FROM instanz k JOIN termin t ON t.instanz_id = k.id
							WHERE k.behoerde_id = i.behoerde_id AND t.datum >= current_date)
					RETURNING 1
				) SELECT count(*)::int AS anzahl FROM befoerdert`;
			return zeilen[0]?.anzahl ?? 0;
		},

		async registryFaellig(jetzt) {
			const [eintrag] = await sql<{ faellig: boolean }[]>`
				SELECT NOT EXISTS (SELECT FROM cache WHERE schluessel = 'registry' AND laeuft_ab > ${jetzt}) AS faellig`;
			return eintrag.faellig;
		},

		async registryStand() {
			const [eintrag] = await sql<Array<{ etag: string | null; last_modified: string | null }>>`
				SELECT wert->'stand'->>'etag' AS etag, wert->'stand'->>'lastModified' AS last_modified
				FROM cache WHERE schluessel = 'registry'`;
			return { etag: eintrag?.etag ?? undefined, lastModified: eintrag?.last_modified ?? undefined };
		},

		async registrySpeichern(inhalt, stand, geprueft) {
			const vorher = await sql<Array<{ inhalt: unknown }>>`
				SELECT wert->'inhalt' AS inhalt FROM cache WHERE schluessel = 'registry'`;
			await sql`INSERT INTO cache (schluessel, wert, laeuft_ab)
				VALUES ('registry', ${sql.json({ inhalt: inhalt ?? vorher[0]?.inhalt ?? null, stand } as never)}, ${new Date(geprueft.getTime() + 24 * 60 * 60_000)})
				ON CONFLICT (schluessel) DO UPDATE SET wert = excluded.wert,
					laeuft_ab = excluded.laeuft_ab, aktualisiert_am = now()`;
		},

		async behoerdenSpeichern(behoerden, geprueft, vollstaendig = true) {
			await sql.begin(async (tx) => {
				if (vollstaendig) await tx`UPDATE behoerde SET aktiv = false, aktualisiert_am = ${geprueft}`;
				for (const eintrag of behoerden) {
					const [behoerde] = await tx<{ id: number }[]>`
						INSERT INTO behoerde (kennung, name, land, regionalschluessel, url, aktiv, aktualisiert_am)
						VALUES (${eintrag.ags}, ${eintrag.name || eintrag.ort || eintrag.ags},
							${landCode(eintrag)}, ${eintrag.ags.slice(0, 5)}, ${eintrag.basisUrl}, true, ${geprueft})
						ON CONFLICT (kennung) DO UPDATE SET name = excluded.name, land = excluded.land,
							regionalschluessel = excluded.regionalschluessel, url = excluded.url,
							aktiv = true, aktualisiert_am = excluded.aktualisiert_am
						RETURNING id`;
					const url = termineUrl(eintrag.basisUrl, eintrag.ags);
					const [instanz] = await tx<{ id: number }[]>`
						INSERT INTO instanz (behoerde_id, termin_url, aktualisiert_am)
						VALUES (${behoerde.id}, ${url}, ${geprueft})
						ON CONFLICT (behoerde_id, termin_url) DO UPDATE SET aktualisiert_am = excluded.aktualisiert_am
						RETURNING id`;
					const versatz = optionen.sofort ? 0 : streuung(eintrag.ags);
					await tx`INSERT INTO pfad_stand (instanz_id, pfad, prioritaet, naechste_pruefung)
						VALUES (${instanz.id}, ${url}, 10, ${new Date(geprueft.getTime() + versatz)})
						ON CONFLICT (instanz_id, pfad) DO NOTHING`;
				}
			});
		}
	};
}

function landCode(behoerde: Behoerde): string {
	const land = behoerde.land.toUpperCase();
	const namen: Record<string, string> = {
		'BADEN-WÜRTTEMBERG': 'BW', BAYERN: 'BY', BERLIN: 'BE', BRANDENBURG: 'BB', BREMEN: 'HB',
		HAMBURG: 'HH', HESSEN: 'HE', 'MECKLENBURG-VORPOMMERN': 'MV', NIEDERSACHSEN: 'NI',
		'NORDRHEIN-WESTFALEN': 'NW', 'RHEINLAND-PFALZ': 'RP', SAARLAND: 'SL', SACHSEN: 'SN',
		'SACHSEN-ANHALT': 'ST', 'SCHLESWIG-HOLSTEIN': 'SH', THÜRINGEN: 'TH'
	};
	const code = namen[land] ?? land;
	if (!/^[A-Z]{2}$/.test(code)) throw new Error(`Ungültiges Bundesland für Behörde ${behoerde.ags}`);
	return code;
}

export function deutschesDatum(wert: string): string {
	const datum = wert.match(/\d{1,2}\.\d{1,2}\.\d{4}/)?.[0] ?? '';
	const [tag, monat, jahr] = datum.split('.');
	if (!jahr || !monat || !tag) throw new Error(`Ungültiges Datum ${wert}`);
	return `${jahr}-${monat.padStart(2, '0')}-${tag.padStart(2, '0')}`;
}

/**
 * Zustand eines frisch entdeckten Pfades aus dem Termindatum. Fest verdrahtetes
 * 'vorlauf'/'wahlabend' hat die Pfade der Wahl vom 13.09.2026 schon zwei Wochen
 * vorher in den 30-s-Takt gehängt — für Platzhalterdateien ohne `Komponente`,
 * aus denen `naechsterZustand` nie wieder herausfindet. Das sättigte die
 * Drossel und sperrte den Backfill dauerhaft aus.
 *
 * Für den Wahltag selbst entscheidet dieselbe Zeitfenster-Regel wie beim
 * Übergang, statt einer zweiten Festlegung daneben: sonst liefe ein am Morgen
 * entdeckter Pfad schon vor Schließung der Wahllokale im 30-s-Takt.
 */
export function terminZustand(datum: string, jetzt: Date): Zustand {
	// Ortszeit, nicht toISOString(): der Container läuft mit TZ=Europe/Berlin,
	// und zwischen 00:00 und 02:00 wäre der UTC-Tag noch der Vortag — ein um
	// Mitternacht entdeckter Wahltag gälte dann als Zukunft.
	const heute = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
	if (datum < heute) return 'ruhend';
	if (datum > heute) return 'geplant';
	return naechsterZustand('geplant', jetzt, { wahltag: new Date(datum) });
}

export interface TerminEintrag { date: string; name: string; url: string }

/** CLI-Filter gelten nur, wenn ein Probe-/Backfill-Lauf sie ausdrücklich setzt. */
export function filtereTermine(termine: TerminEintrag[], wahltage?: string[]): TerminEintrag[] {
	return wahltage?.length
		? termine.filter((termin) => wahltage.includes(deutschesDatum(termin.date).replaceAll('-', '')))
		: termine;
}

function dokumentZustand(aufgabe: PollerAufgabe, inhalt: unknown, jetzt: Date, geaendert: boolean): Zustand {
	let aktuell = aufgabe.zustand === 'unerreichbar' ? aufgabe.zustandVorFehler ?? 'beobachtung' : aufgabe.zustand;
	const komponente = (inhalt as { Komponente?: unknown } | undefined)?.Komponente;
	// Vollständigkeit und amtliches Endergebnis kommen aus demselben Parser wie
	// die Anzeige. Die frühere Eigenbau-Regex kannte den deutschen Tausenderpunkt
	// nicht: "12 von 1.240" ergab [12, 1] und damit vollständig — der Pfad wäre
	// am Wahlabend sofort von 30 s auf 15 min gefallen, unsichtbar hinter einer
	// korrekten Anzeige.
	const stand = komponente ? parseErgebnis(inhalt as never) : undefined;
	// Ohne Termindatum (Wurzel-Instanz mit termine.json) gibt es kein Zeitfenster;
	// ein Datum weit in der Zukunft hält den Pfad dann in seinem Zustand.
	const wahltag = aufgabe.terminDatum ? new Date(aufgabe.terminDatum) : new Date(8.64e15);
	const signale = {
		wahltag,
		strukturGeladen: aufgabe.strukturGeladen,
		amtlich: Boolean(stand?.amtlicheSitze),
		geaendert,
		letzteAenderung: geaendert ? jetzt : aufgabe.letzteAenderung
	};
	aktuell = naechsterZustand(aktuell, jetzt, { ...signale, vollstaendig: stand?.stand.vollstaendig });
	return naechsterZustand(aktuell, jetzt, signale);
}

function streuung(kennung: string): number {
	let hash = 0;
	for (const zeichen of kennung) hash = (hash * 31 + zeichen.charCodeAt(0)) >>> 0;
	return hash % 86_400_000;
}
