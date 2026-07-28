import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	// adapter-auto: Deployment-Ziel bleibt bewusst offen (siehe Plan).
	kit: { adapter: adapter() }
};
