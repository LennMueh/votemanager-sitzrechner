import { json } from '@sveltejs/kit';
import { berechneVertretung } from '$lib/server/daten';
import { zaehle } from '$lib/server/metrik';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, request }) => {
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
		const ergebnis = await berechneVertretung(ags ?? undefined, wahl, gebiet, wahltag, instanz);
		// Nachladen per SSE ist kein Aufruf; die Seite kennzeichnet es selbst.
		// ponytail: ein Label je besuchter Vertretung; bei Kardinalitätsproblemen auf Top-N oder Behörde kürzen
		if (!request.headers.has('x-aktualisierung')) {
			zaehle('vertretung_aufrufe_total', 1, { vertretung: `${ergebnis.ref.behoerde} – ${ergebnis.ref.titel}` });
		}
		return json(ergebnis);
	} catch (e) {
		return json({ fehler: String(e) }, { status: 502 });
	}
};
