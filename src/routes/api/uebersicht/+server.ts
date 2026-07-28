import { json } from '@sveltejs/kit';
import { holeUebersicht } from '$lib/server/daten';
import { WAHLTAG } from '$lib/votemanager';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	// ?wahltag=20210912 rechnet gegen die echten Daten der Kommunalwahl 2021.
	const wahltag = url.searchParams.get('wahltag') ?? WAHLTAG;
	try {
		return json(await holeUebersicht(wahltag));
	} catch (e) {
		return json({ fehler: String(e), wahltag, eintraege: [] }, { status: 502 });
	}
};
