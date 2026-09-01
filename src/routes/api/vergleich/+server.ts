import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { berechneVertretung, holeWahltermine, wahlpfad } from '$lib/server/daten';
import { waehleGegenwahl } from '$lib/server/vergleich';
import type { RequestHandler } from './$types';

interface WahlZeile {
	instanzId: number;
	ags: string;
	wahlId: string;
	gebietId: string;
	name: string;
	gebietName: string;
	wahltag: string;
}

const datum = (x: string) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;

export const GET: RequestHandler = async ({ url }) => {
	const instanzText = url.searchParams.get('instanz');
	const instanz = instanzText ? Number(instanzText) : undefined;
	const ags = url.searchParams.get('ags');
	const wahl = Number(url.searchParams.get('wahl'));
	const gebiet = url.searchParams.get('gebiet');
	let wahltag = url.searchParams.get('wahltag') ?? url.searchParams.get('jahr') ?? undefined;
	if ((!instanz && !ags) || !Number.isSafeInteger(wahl) || wahl <= 0 || !gebiet ||
		(instanz !== undefined && (!Number.isSafeInteger(instanz) || instanz <= 0)) ||
		(wahltag !== undefined && !/^\d{8}$/.test(wahltag))) {
		return json({ fehler: 'instanz oder ags sowie wahl und gebiet sind erforderlich' }, { status: 400 });
	}
	if (!instanz && !wahltag) wahltag = (await holeWahltermine()).standard;

	const basis = await db()<WahlZeile[]>`
		SELECT i.id::int AS "instanzId", b.kennung AS ags, w.wahl_id AS "wahlId", w.gebiet_id AS "gebietId",
			w.name, w.gebiet_name AS "gebietName", to_char(t.datum, 'YYYYMMDD') AS wahltag
		FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
		WHERE w.wahl_id=${String(wahl)} AND w.gebiet_id=${gebiet}
			AND (${instanz ?? null}::bigint IS NOT NULL AND i.id=${instanz ?? null}
				OR ${instanz ?? null}::bigint IS NULL AND b.kennung=${ags ?? ''} AND t.datum=${wahltag ? datum(wahltag) : null}::date)
		LIMIT 1`;
	if (!basis.length) return json({ fehler: 'Wahl nicht gefunden' }, { status: 404 });

	const kandidaten = await db()<WahlZeile[]>`
		SELECT i.id::int AS "instanzId", b.kennung AS ags, w.wahl_id AS "wahlId", w.gebiet_id AS "gebietId",
			w.name, w.gebiet_name AS "gebietName", to_char(t.datum, 'YYYYMMDD') AS wahltag
		FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
		WHERE b.kennung=${basis[0].ags} AND EXISTS (
			SELECT 1 FROM pfad_stand p JOIN dokument d ON d.pfad_stand_id=p.id
			WHERE p.instanz_id=i.id AND ${wahlpfad(db())} = '/wahl_' || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json')`;
	const ziel = waehleGegenwahl(basis[0], kandidaten);
	if (!ziel) return json({ fehler: `Keine passende Gegenwahl für ${basis[0].name}` }, { status: 404 });

	const [aktuell, vergleich] = await Promise.all([
		berechneVertretung(undefined, wahl, gebiet, undefined, basis[0].instanzId),
		berechneVertretung(undefined, Number(ziel.wahlId), ziel.gebietId, undefined, ziel.instanzId)
	]);
	return json({ aktuell, vergleich, aktuellWahltag: basis[0].wahltag, vergleichWahltag: ziel.wahltag });
};
