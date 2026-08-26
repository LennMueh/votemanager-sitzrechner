import { json } from '@sveltejs/kit';
import { holeUebersicht } from '$lib/server/daten';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const wahltag = url.searchParams.get('wahltag') ?? undefined;
	if (wahltag && !/^\d{8}$/.test(wahltag)) {
		return json({ fehler: 'wahltag muss das Format YYYYMMDD haben' }, { status: 400 });
	}
	try {
		return json(await holeUebersicht(wahltag));
	} catch (e) {
		return json({ fehler: String(e), wahltag: wahltag ?? '', wahltermine: [], eintraege: [] }, { status: 502 });
	}
};
