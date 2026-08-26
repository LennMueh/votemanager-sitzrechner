import { db } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		await db()`SELECT 1`;
		return new Response('ok\n');
	} catch {
		return new Response('database unavailable\n', { status: 503 });
	}
};
