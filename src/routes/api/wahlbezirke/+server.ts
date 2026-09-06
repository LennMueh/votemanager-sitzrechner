import { json } from '@sveltejs/kit';
import { holeBezirksergebnis, holeWahlbezirke } from '$lib/server/daten';
import type { RequestHandler } from './$types';

/**
 * Wahllokale einer Wahl, beschränkt auf das angezeigte Gebiet.
 *
 * Mit `bezirk=<gebietId>` stattdessen das vollständige Ergebnis dieses einen
 * Wahllokals. Ein Endpunkt statt zweier: die Vorprüfung der Parameter ist
 * dieselbe, und die Detailform wird nur beim Aufklappen einer Zeile abgerufen.
 */
export const GET: RequestHandler = async ({ url }) => {
	const ags = url.searchParams.get('ags');
	const instanzText = url.searchParams.get('instanz');
	const instanz = instanzText ? Number(instanzText) : undefined;
	const wahl = Number(url.searchParams.get('wahl'));
	const gebiet = url.searchParams.get('gebiet');
	const bezirk = url.searchParams.get('bezirk');
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
	// Das Detail hängt an der Instanz: derselbe Bezirk trägt in Kreis-,
	// Samtgemeinde- und Gemeindewahl andere Zahlen, und ohne Instanz ließe sich
	// der Pfad nicht eindeutig auflösen.
	if (bezirk && !instanz) {
		return json({ fehler: 'für ein einzelnes Wahllokal ist instanz erforderlich' }, { status: 400 });
	}
	try {
		return json(bezirk
			? await holeBezirksergebnis(instanz!, wahl, bezirk)
			: await holeWahlbezirke(ags ?? undefined, wahl, gebiet, wahltag, instanz));
	} catch (e) {
		return json({ fehler: String(e) }, { status: 502 });
	}
};
