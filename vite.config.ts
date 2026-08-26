import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.test.ts'],
		// Die Golden Tests holen echte Daten von votemanager.
		testTimeout: 120_000
	}
});
