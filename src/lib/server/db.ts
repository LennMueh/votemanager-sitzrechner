import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import type { Behoerde, PollerAufgabe, PollerSpeicher } from './poller/index.ts';
import { apiWurzel, termineUrl } from './poller/urls.ts';
import { naechsterZustand, pruefIntervall, type Zustand } from './poller/zustand.ts';

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
				}>
			>`SELECT p.id::text, p.pfad, p.instanz_id, coalesce(i.api_wurzel, i.termin_url) AS basis,
				p.zustand, p.prioritaet, p.etag, p.last_modified, p.fehler_anzahl,
				p.zuletzt_geaendert, p.zustand_vor_fehler
			FROM pfad_stand p JOIN instanz i ON i.id = p.instanz_id
			WHERE p.naechste_pruefung <= now() AND (${backfill} OR p.zustand <> 'ruhend')
				AND (p.zustand <> 'ruhend' OR NOT EXISTS (
					SELECT 1 FROM pfad_stand live WHERE live.zustand IN ('vorlauf', 'wahlabend')
				))
			ORDER BY p.prioritaet DESC, p.naechste_pruefung
			LIMIT ${limit}`;
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
				zustandVorFehler: z.zustand_vor_fehler ?? undefined
			}));
		},

		async erfolg(aufgabe, ergebnis) {
			if (aufgabe.instanzId === undefined) throw new Error('Poller-Aufgabe ohne Instanz');
			const instanzId = aufgabe.instanzId;
			const zustand = dokumentZustand(aufgabe, ergebnis.inhalt, ergebnis.geprueft, ergebnis.geaendert);
			const intervall = pruefIntervall(zustand) ?? 24 * 60 * 60_000;
			await sql.begin(async (tx) => {
				await tx`INSERT INTO host_stand (host, fehler_anzahl, zuletzt_erreichbar, letzter_fehler)
					VALUES (${new URL(aufgabe.url).host}, 0, ${ergebnis.geprueft}, null)
					ON CONFLICT (host) DO UPDATE SET fehler_anzahl=0, zuletzt_erreichbar=excluded.zuletzt_erreichbar, letzter_fehler=null, aktualisiert_am=now()`;
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
					const alleTermine = (ergebnis.inhalt as { termine?: Array<{ date: string; name: string; url: string }> }).termine ?? [];
					const termine = optionen.wahltage?.length
						? alleTermine.filter((t) => optionen.wahltage!.includes(deutschesDatum(t.date).replaceAll('-', '')))
						: alleTermine;
					const [quelle] = await tx<{ behoerde_id: number }[]>`SELECT behoerde_id FROM instanz WHERE id=${instanzId}`;
					for (const t of termine) {
						const terminUrl = new URL(t.url, new URL('../', aufgabe.url)).href;
						const [instanz] = await tx<{ id: number }[]>`INSERT INTO instanz (behoerde_id, termin_url) VALUES (${quelle.behoerde_id}, ${terminUrl}) ON CONFLICT (behoerde_id, termin_url) DO UPDATE SET aktualisiert_am=now() RETURNING id`;
						const datum = deutschesDatum(t.date);
						await tx`INSERT INTO termin (instanz_id, termin_id, name, datum) VALUES (${instanz.id}, ${datum}, ${t.name}, ${datum}) ON CONFLICT (instanz_id, termin_id) DO UPDATE SET name=excluded.name, datum=excluded.datum`;
						const vergangen = datum < ergebnis.geprueft.toISOString().slice(0, 10);
						const pruefung = optionen.sofort || vergangen ? ergebnis.geprueft : new Date(`${datum}T17:45:00+02:00`);
						await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung)
							VALUES (${instanz.id}, ${new URL('js/app.js', terminUrl).href}, ${vergangen ? 'ruhend' : 'vorlauf'}, 40, ${pruefung})
							ON CONFLICT (instanz_id, pfad) DO UPDATE SET naechste_pruefung=excluded.naechste_pruefung`;
					}
				} else if (aufgabe.pfad.endsWith('js/app.js') && typeof ergebnis.inhalt === 'string') {
					const wurzel = apiWurzel(aufgabe.url.replace(/js\/app\.js$/, ''), ergebnis.inhalt);
					await tx`UPDATE instanz SET api_wurzel=${wurzel} WHERE id=${instanzId}`;
					await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${new URL('termin.json', wurzel).href}, ${aufgabe.zustand === 'ruhend' ? 'ruhend' : 'vorlauf'}, 60, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
				} else if (aufgabe.pfad.endsWith('termin.json')) {
					const roh = ergebnis.inhalt as { datum_string?: string; wahleintraege?: Array<{ wahl: { id: number; titel: string }; gebiet_link: { id: string; title: string } }> };
					const datum = deutschesDatum(roh.datum_string ?? '');
					const [termin] = await tx<{ id: number }[]>`SELECT id FROM termin WHERE instanz_id=${instanzId} AND datum=${datum}::date LIMIT 1`;
					const [instanz] = await tx<{ api_wurzel: string }[]>`SELECT api_wurzel FROM instanz WHERE id=${instanzId}`;
					if (termin && instanz?.api_wurzel) for (const w of roh.wahleintraege ?? []) {
						await tx`INSERT INTO wahl (termin_id, wahl_id, gebiet_id, gebiet_name, name) VALUES (${termin.id}, ${String(w.wahl.id)}, ${w.gebiet_link.id}, ${w.gebiet_link.title}, ${w.wahl.titel}) ON CONFLICT (termin_id, wahl_id, gebiet_id) DO UPDATE SET name=excluded.name, gebiet_name=excluded.gebiet_name`;
						for (const pfad of [`wahl_${w.wahl.id}/wahl.json`, `wahl_${w.wahl.id}/ergebnis_${w.gebiet_link.id}_0.json`]) await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${new URL(pfad, instanz.api_wurzel).href}, ${aufgabe.zustand === 'ruhend' ? 'ruhend' : 'wahlabend'}, 80, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
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
						await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${url.href}, ${zustand}, 75, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
					}
				} else if (/wahl_\d+\/uebersicht_.+_0\.json$/.test(aufgabe.pfad)) {
					const zeilen = (ergebnis.inhalt as { tabelle?: { zeilen?: Array<{ name?: string; title?: string; link?: { id?: string; title?: string } }> } }).tabelle?.zeilen ?? [];
					const treffer = aufgabe.pfad.match(/wahl_(\d+)\/uebersicht_(.+)_0\.json$/)!;
					const [ebene] = await tx<{ id: number }[]>`SELECT id FROM uebersicht_ebene
						WHERE instanz_id=${instanzId} AND wahl_id=${treffer[1]} AND ebene_id=${treffer[2]}`;
					for (const z of zeilen) if (z.link?.id) {
						if (ebene) await tx`INSERT INTO gebiet (uebersicht_ebene_id, gebiet_id, name)
							VALUES (${ebene.id}, ${z.link.id}, ${z.link.title ?? z.title ?? z.name ?? z.link.id})
							ON CONFLICT (uebersicht_ebene_id, gebiet_id) DO UPDATE SET name=excluded.name`;
						const url = new URL(`ergebnis_${z.link.id}_0.json`, aufgabe.url.replace(/uebersicht_.+_0\.json$/, ''));
						await tx`INSERT INTO pfad_stand (instanz_id, pfad, zustand, prioritaet, naechste_pruefung) VALUES (${instanzId}, ${url.href}, ${zustand}, 85, ${ergebnis.geprueft}) ON CONFLICT (instanz_id, pfad) DO NOTHING`;
					}
				}
			});
		},

		async fehler(aufgabe, fehler, naechstePruefung) {
			const host = new URL(aufgabe.url).host;
			await sql.begin(async (tx) => {
				await tx`UPDATE pfad_stand SET fehler_anzahl = fehler_anzahl + 1,
					fehler = ${String(fehler)}, naechste_pruefung = ${naechstePruefung}, status = null,
					zustand_vor_fehler = CASE WHEN fehler_anzahl + 1 >= 5 AND zustand <> 'unerreichbar' THEN zustand ELSE zustand_vor_fehler END,
					zustand = CASE WHEN fehler_anzahl + 1 >= 5 THEN 'unerreichbar' ELSE zustand END
				WHERE id = ${aufgabe.id}`;
				await tx`INSERT INTO host_stand (host, naechster_abruf, fehler_anzahl, letzter_fehler)
					VALUES (${host}, ${naechstePruefung}, 1, ${String(fehler)}) ON CONFLICT (host) DO UPDATE SET
					naechster_abruf=excluded.naechster_abruf, fehler_anzahl=host_stand.fehler_anzahl+1,
					letzter_fehler=excluded.letzter_fehler, aktualisiert_am=now()`;
			});
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

function dokumentZustand(aufgabe: PollerAufgabe, inhalt: unknown, jetzt: Date, geaendert: boolean): Zustand {
	let aktuell = aufgabe.zustand === 'unerreichbar' ? aufgabe.zustandVorFehler ?? 'beobachtung' : aufgabe.zustand;
	const komponente = (inhalt as { Komponente?: { sitze?: unknown; info?: { hinweis?: string[] } } } | undefined)?.Komponente;
	const text = komponente?.info?.hinweis?.join(' ') ?? '';
	const stand = text.match(/(\d+)\D+(?:von|\/|der)\D*(\d+)/i);
	const vollstaendig = Boolean(stand && Number(stand[1]) >= Number(stand[2]));
	aktuell = naechsterZustand(aktuell, jetzt, {
		wahltag: jetzt, vollstaendig, amtlich: Boolean(komponente?.sitze),
		geaendert, letzteAenderung: geaendert ? jetzt : aufgabe.letzteAenderung
	});
	return naechsterZustand(aktuell, jetzt, {
		wahltag: jetzt, amtlich: Boolean(komponente?.sitze), geaendert,
		letzteAenderung: geaendert ? jetzt : aufgabe.letzteAenderung
	});
}

function streuung(kennung: string): number {
	let hash = 0;
	for (const zeichen of kennung) hash = (hash * 31 + zeichen.charCodeAt(0)) >>> 0;
	return hash % 86_400_000;
}
