import { json } from '@sveltejs/kit';
import { berechneVertretung } from '$lib/server/daten';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const ags = url.searchParams.get('ags');
	const instanzText = url.searchParams.get('instanz');
	const instanz = instanzText ? Number(instanzText) : undefined;
	const wahl = Number(url.searchParams.get('wahl'));
	const gebiet = url.searchParams.get('gebiet');
	const wahltag = url.searchParams.get('wahltag') ?? undefined;

	if (
		(!ags && !instanz) ||
		(instanz !== undefined && (!Number.isSafeInteger(instanz) || instanz <= 0)) ||
		!Number.isSafeInteger(wahl) || wahl <= 0 ||
		!gebiet ||
		(wahltag !== undefined && !/^\d{8}$/.test(wahltag))
	) {
		return json({ fehler: 'instanz oder ags sowie wahl und gebiet sind erforderlich' }, { status: 400 });
	}
	try {
		return json(await berechneVertretung(ags ?? undefined, wahl, gebiet, wahltag, instanz));
	} catch (e) {
		return json({ fehler: String(e) }, { status: 502 });
	}
};
