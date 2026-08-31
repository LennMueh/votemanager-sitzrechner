import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { holeWahltermine, regionName, regionsname } from '$lib/server/daten';
import type { KatalogEintrag } from '$lib/katalog';
import type { RequestHandler } from './$types';

/**
 * Der Katalog liefert nur einen Wahltermin, nicht den ganzen Bestand.
 *
 * Ohne Filter waren das 30.518 Zeilen mit je dreizehn Feldern — die Oberfläche
 * filtert davon ohnehin zuerst auf einen Termin und zeigt höchstens 200. Der
 * Rest war reine Last: er musste in PostgreSQL gelesen, als JS-Objekte gebaut,
 * serialisiert und übertragen werden, und genau solche Allokationen haben den
 * Node-Heap der Web-Pods gesprengt. Der größte einzelne Termin hat 7.815 Zeilen,
 * der Standardtermin drei.
 *
 * Ohne Angabe gilt der Standardtermin — damit bleibt der erste Aufruf ein
 * einziger Umlauf: die Antwort trägt die Termin-Liste gleich mit, und erst wenn
 * der Nutzer den Termin wechselt, wird neu geholt.
 */
export const GET: RequestHandler = async ({ url }) => {
	const suche = url.searchParams.get('q')?.trim() ?? '';
	const termine = await holeWahltermine();
	const roh = url.searchParams.get('termin') ?? '';
	if (roh && !/^\d{4}-\d{2}-\d{2}$/.test(roh)) {
		return json({ fehler: 'termin muss das Format YYYY-MM-DD haben' }, { status: 400 });
	}
	const standard = termine.standard;
	const termin = roh || (standard ? `${standard.slice(0, 4)}-${standard.slice(4, 6)}-${standard.slice(6, 8)}` : '');
	const eintraege = await db()<KatalogEintrag[]>`
		WITH regionsname AS (${regionsname(db())})
		SELECT b.land, b.regionalschluessel AS region,
			r.name AS "regionName",
			b.kennung AS ags, b.name AS behoerde, t.name AS termin, t.datum::text AS datum,
			i.id AS "instanzId", w.wahl_id AS "wahlId", w.gebiet_id AS "gebietId", w.gebiet_name AS gebiet, w.name AS wahl,
			coalesce(w.wahlart, CASE
				WHEN w.name ~* '(bürgermeister|landrat|stichwahl)' THEN 'direktwahl'
				WHEN w.name ~* '(bundestag)' THEN 'bund'
				WHEN w.name ~* '(landtag)' THEN 'land'
				WHEN w.name ~* '(europa)' THEN 'europa'
				ELSE 'kommunal' END) AS wahlart
		FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id
		JOIN behoerde b ON b.id=i.behoerde_id
		LEFT JOIN regionsname r ON r.regionalschluessel=b.regionalschluessel
		WHERE b.aktiv AND (${termin} = '' OR t.datum = ${termin || null}::date)
			AND (${suche} = '' OR concat_ws(' ', b.name, t.name, w.name, w.gebiet_id) ILIKE ${`%${suche}%`})
		ORDER BY b.land, "regionName", b.name, t.datum DESC, w.name
	`;
	for (const e of eintraege) e.regionName = regionName(e.region, e.regionName || null);
	return json({ eintraege, termin, wahltag: termine.standard, wahltermine: termine.wahltermine, termine: termine.termine });
};
