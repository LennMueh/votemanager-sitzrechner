import { metriken } from '$lib/server/metrik';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => new Response(metriken(), {
	headers: { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' }
});
