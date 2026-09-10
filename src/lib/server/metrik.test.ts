import { describe, expect, it } from 'vitest';
import { metriken, zaehle } from './metrik';

describe('Metriken', () => {
	it('maskiert Labelwerte und hält eine Metrik unter einer TYPE-Zeile zusammen', () => {
		zaehle('probe_total', 1, { vertretung: 'Samtgemeinde "Bardowick"\\Rat' });
		zaehle('probe_total_neben');
		zaehle('probe_total', 2, { vertretung: 'Stadt\nLüneburg' });
		const text = metriken();
		expect(text.match(/# TYPE votemanager_probe_total counter/g)).toHaveLength(1);
		expect(text).toContain(
			'votemanager_probe_total{vertretung="Samtgemeinde \\"Bardowick\\"\\\\Rat"} 1\n' +
				'votemanager_probe_total{vertretung="Stadt\\nLüneburg"} 2\n'
		);
	});

	it('führt einen Namen ohne _total als Gauge, der auf null zurückgeht', () => {
		zaehle('probe_offen');
		zaehle('probe_offen', -1);
		expect(metriken()).toContain('# TYPE votemanager_probe_offen gauge\nvotemanager_probe_offen 0\n');
	});
});
