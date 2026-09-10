import type { Handle } from '@sveltejs/kit';
import { zaehle } from '$lib/server/metrik';

// Die Routen-ID, nie die URL: so bleiben es so wenige Labels, wie es Routen
// gibt, egal welche Parameter jemand anhängt.
export const handle: Handle = ({ event, resolve }) => {
	zaehle('anfragen_total', 1, { route: event.route.id ?? 'unbekannt' });
	return resolve(event);
};
