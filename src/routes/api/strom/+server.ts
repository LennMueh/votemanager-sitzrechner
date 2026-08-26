import { abonniere, erstelleReplayPuffer, seit, type Ereignis } from '$lib/server/strom';
import { zaehle } from '$lib/server/metrik';
import type { RequestHandler } from './$types';

const encoder = new TextEncoder();
const schreibe = (controller: ReadableStreamDefaultController, text: string) =>
	controller.enqueue(encoder.encode(text));

export const GET: RequestHandler = async ({ request, url }) => {
	const schluessel = [...new Set((url.searchParams.get('abo') ?? '').split(',').filter(Boolean))];
	if (!schluessel.length || schluessel.length > 50 || schluessel.some((x) => x.length > 200)) {
		return new Response('abo muss 1 bis 50 gültige Schlüssel enthalten', { status: 400 });
	}
	zaehle('sse_verbindungen_total');

	const letzteId = Number(request.headers.get('last-event-id') ?? 0);
	let aufraeumen = () => {};
	const stream = new ReadableStream({
		async start(controller) {
			const senden = (e: { id: number; schluessel: string; dokument_id: number | null }) =>
				schreibe(controller, `id: ${e.id}\nevent: update\ndata: ${JSON.stringify({ schluessel: e.schluessel, dokumentId: e.dokument_id })}\n\n`);
			const puffer = erstelleReplayPuffer(senden);
			const abmelden = await abonniere(new Set(schluessel), puffer.live);

			try {
				let replay: Ereignis[] = [];
				if (Number.isSafeInteger(letzteId) && letzteId > 0) {
					const verpasst = await seit(letzteId, schluessel);
					if (verpasst.length > 1000) schreibe(controller, 'event: reset\ndata: {}\n\n');
					else replay = verpasst;
				}
				puffer.abschliessen(replay);
			} catch (fehler) {
				abmelden();
				throw fehler;
			}

			const heartbeat = setInterval(() => schreibe(controller, ': heartbeat\n\n'), 15_000);
			aufraeumen = () => {
				clearInterval(heartbeat);
				abmelden();
				try { controller.close(); } catch { /* bereits geschlossen */ }
			};
			request.signal.addEventListener('abort', aufraeumen, { once: true });
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
			'x-accel-buffering': 'no'
		}
	});
};
