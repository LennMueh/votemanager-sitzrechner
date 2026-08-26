import { describe, expect, it } from 'vitest';
import { waehleStandardtermin } from './daten';

describe('dynamischer Standardtermin', () => {
	it('nimmt den nächsten Termin, sonst den neuesten vergangenen', () => {
		expect(waehleStandardtermin(['20210912', '20260913', '20280910'], '20260826')).toBe('20260913');
		expect(waehleStandardtermin(['20210912', '20250914'], '20260826')).toBe('20250914');
		expect(waehleStandardtermin([], '20260826')).toBe('');
	});
});
