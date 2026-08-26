import { describe, expect, it } from 'vitest';
import { erstelleReplayPuffer, type Ereignis } from './strom';

const ereignis = (id: number): Ereignis => ({ id, schluessel: `v:${id}`, dokument_id: id });

describe('SSE-Replay', () => {
	it('puffert Live-Ereignisse und sendet überlappende IDs nur einmal', () => {
		const ids: number[] = [];
		const puffer = erstelleReplayPuffer((e) => ids.push(e.id));
		puffer.live(ereignis(3));
		puffer.live(ereignis(4));
		puffer.abschliessen([ereignis(2), ereignis(3)]);
		puffer.live(ereignis(4));
		puffer.live(ereignis(5));
		expect(ids).toEqual([2, 3, 4, 5]);
	});
});
