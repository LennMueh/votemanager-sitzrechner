import { describe, expect, it } from 'vitest';
import { vergleichePersonen } from './vergleich';

describe('Personenvergleich', () => {
	it('gruppiert nach Liste und richtet gleiche Namen in einer Zeile aus', () => {
		const aktuell = { amtlich: { anzahl: 2, gewaehlte: [['CDU', 'Müller, Anna', 'Listenplatz 1'], ['CDU', 'Schmidt, Ben', 'direkt']] } };
		const vergleich = { amtlich: { anzahl: 2, gewaehlte: [['CDU', 'Mueller, Clara', 'Listenplatz 3'], ['CDU', 'Müller, Anna', 'Listenplatz 2']] } };
		const [cdu] = vergleichePersonen(aktuell, vergleich);
		expect(cdu.zeilen.map((z) => [z.aktuell?.name, z.vergleich?.name])).toEqual([
			['Müller, Anna', 'Müller, Anna'], ['Schmidt, Ben', undefined], [undefined, 'Mueller, Clara']
		]);
	});
});
