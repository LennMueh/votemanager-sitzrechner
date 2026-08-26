import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { berechneVertretung } from '$lib/server/daten';
import { WAHLTAG } from '$lib/votemanager';
import type { RequestHandler } from '@sveltejs/kit';

const datum = (x: string) => `${x.slice(0, 4)}-${x.slice(4, 6)}-${x.slice(6, 8)}`;
const art = (x: string) => x.toLowerCase().replace(/wahl des|wahl der|zur|zum|\W/g, '').replace(/(landkreis|gemeinde|hansestadt|stadt)/g, '');

export const GET: RequestHandler = async ({ url }) => {
	const ags = url.searchParams.get('ags');
	const wahl = Number(url.searchParams.get('wahl'));
	const gebiet = url.searchParams.get('gebiet');
	const jahr = url.searchParams.get('jahr') ?? WAHLTAG;
	if (!ags || !Number.isSafeInteger(wahl) || !gebiet || !/^\d{8}$/.test(jahr)) return json({ fehler: 'ags, wahl, gebiet und jahr sind erforderlich' }, { status: 400 });
	const basis = await db()<Array<{ name: string; gebiet_name: string }>>`
		SELECT name, gebiet_name FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
		WHERE b.kennung=${ags} AND w.wahl_id=${String(wahl)} AND w.gebiet_id=${gebiet} AND t.datum=${datum(jahr)}::date LIMIT 1`;
	if (!basis.length) return json({ fehler: 'Wahl nicht gefunden' }, { status: 404 });
	const ziel = jahr === '20210912' ? '20260913' : '20210912';
	const kandidaten = await db()<Array<{ wahl_id: string; gebiet_id: string; name: string; gebiet_name: string }>>`
		SELECT w.wahl_id,w.gebiet_id,w.name,w.gebiet_name FROM wahl w JOIN termin t ON t.id=w.termin_id JOIN instanz i ON i.id=t.instanz_id JOIN behoerde b ON b.id=i.behoerde_id
		WHERE b.kennung=${ags} AND t.datum=${datum(ziel)}::date`;
	const match = kandidaten.find((x) => x.gebiet_name === basis[0].gebiet_name && art(x.name).includes(art(basis[0].name).match(/ortsrat|gemeinderat|samtgemeinderat|kreiswahl|bürgermeister|landrat|stichwahl/)?.[0] ?? ''));
	if (!match) return json({ fehler: `Kein passender Vergleich für ${basis[0].name}` }, { status: 404 });
	const [a, b] = await Promise.all([
		berechneVertretung(ags, wahl, gebiet, jahr),
		berechneVertretung(ags, Number(match.wahl_id), match.gebiet_id, ziel)
	]);
	return json({ aktuell: a, vergleich: b, aktuellJahr: jahr.slice(0, 4), vergleichJahr: ziel.slice(0, 4) });
};
