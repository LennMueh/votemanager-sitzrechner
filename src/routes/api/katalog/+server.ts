import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { holeWahltermine, regionsname } from '$lib/server/daten';
import type { KatalogEintrag } from '$lib/katalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const suche = url.searchParams.get('q')?.trim() ?? '';
	const termine = await holeWahltermine();
	const eintraege = await db()<KatalogEintrag[]>`
		WITH regionsname AS (${regionsname(db())})
		SELECT b.land, b.regionalschluessel AS region,
			coalesce(r.name, b.regionalschluessel) AS "regionName",
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
		WHERE b.aktiv AND (${suche} = '' OR concat_ws(' ', b.name, t.name, w.name, w.gebiet_id) ILIKE ${`%${suche}%`})
		ORDER BY b.land, "regionName", b.name, t.datum DESC, w.name
	`;
	return json({ eintraege, wahltag: termine.standard, wahltermine: termine.wahltermine });
};
