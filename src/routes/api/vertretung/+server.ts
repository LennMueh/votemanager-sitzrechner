import { json } from '@sveltejs/kit';
import { berechneVertretung } from '$lib/server/daten';
import { WAHLTAG } from '$lib/votemanager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const ags = url.searchParams.get('ags');
	const wahl = Number(url.searchParams.get('wahl'));
	const gebiet = url.searchParams.get('gebiet');
	const wahltag = url.searchParams.get('wahltag') ?? WAHLTAG;

	if (!ags || !wahl || !gebiet) {
		return json({ fehler: 'ags, wahl und gebiet sind erforderlich' }, { status: 400 });
	}
	try {
		return json(await berechneVertretung(ags, wahl, gebiet, wahltag));
	} catch (e) {
		return json({ fehler: String(e) }, { status: 502 });
	}
};
