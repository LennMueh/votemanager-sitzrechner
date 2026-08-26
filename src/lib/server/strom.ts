import { db } from './db';
import { zaehle } from './metrik';

export interface Ereignis {
	id: number;
	schluessel: string;
	dokument_id: number | null;
}

/** Puffert Live-Ereignisse während des Replays und liefert jede ID nur einmal. */
export function erstelleReplayPuffer(senden: (ereignis: Ereignis) => void): {
	live: (ereignis: Ereignis) => void;
	abschliessen: (replay: Ereignis[]) => void;
} {
	let puffer: Ereignis[] | undefined = [];
	const gesehen = new Set<number>();
	const reihenfolge: number[] = [];
	const einmal = (ereignis: Ereignis) => {
		if (gesehen.has(ereignis.id)) {
			zaehle('sse_replay_duplikate_total');
			return;
		}
		gesehen.add(ereignis.id);
		reihenfolge.push(ereignis.id);
		if (reihenfolge.length > 2048) gesehen.delete(reihenfolge.shift()!);
		senden(ereignis);
	};
	return {
		live: (ereignis) => puffer ? puffer.push(ereignis) : einmal(ereignis),
		abschliessen: (replay) => {
			const live = puffer ?? [];
			puffer = undefined;
			for (const ereignis of [...replay, ...live].sort((a, b) => a.id - b.id)) einmal(ereignis);
		}
	};
}

type Abonnent = { schluessel: Set<string>; senden: (ereignis: Ereignis) => void };
const abonnenten = new Set<Abonnent>();
let gestartet: Promise<void> | undefined;

async function hole(id: string): Promise<void> {
	const [ereignis] = await db()<Ereignis[]>`
		SELECT id, schluessel, dokument_id FROM ereignis WHERE id = ${id}
	`;
	if (!ereignis) return;
	for (const abo of abonnenten) if (abo.schluessel.has(ereignis.schluessel)) abo.senden(ereignis);
}

function starten(): Promise<void> {
	return (gestartet ??= db().listen('wahlergebnis', (id) => void hole(id)).then(() => undefined));
}

export async function abonniere(
	schluessel: Set<string>,
	senden: (ereignis: Ereignis) => void
): Promise<() => void> {
	await starten();
	const abo = { schluessel, senden };
	abonnenten.add(abo);
	return () => abonnenten.delete(abo);
}

export async function seit(letzteId: number, schluessel: string[]): Promise<Ereignis[]> {
	return db()<Ereignis[]>`
		SELECT id, schluessel, dokument_id FROM ereignis
		WHERE id > ${letzteId} AND schluessel IN ${db()(schluessel)}
		ORDER BY id LIMIT 1001
	`;
}
