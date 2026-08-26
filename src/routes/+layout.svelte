<script lang="ts">
	let { children } = $props();
</script>

<svelte:head>
	<title>Sitzrechner Kommunalwahl 2026 — Landkreis Lüneburg</title>
</svelte:head>

{@render children()}

<style>
	/*
	 * Farben über light-dark(): jeder Wert steht einmal da, umgeschaltet wird
	 * allein über color-scheme. Das spart einen zweiten, driftanfälligen
	 * Farbsatz für den Dunkelmodus.
	 */
	:global(:root) {
		color-scheme: light dark;
		--flaeche: light-dark(#ffffff, #14161a);
		--flaeche-2: light-dark(#f5f6f8, #1d2027);
		--rand: light-dark(#dcdfe4, #333944);
		--text: light-dark(#14161a, #f2f4f7);
		--text-2: light-dark(#4a5058, #b6bdc7);
		--text-3: light-dark(#767d87, #868e9a);
		--akzent: light-dark(#1a56c4, #7ea8ff);
		--warn: light-dark(#8a5a00, #ffc963);
		--warn-flaeche: light-dark(#fff6e0, #3a2d0c);
		--gut: light-dark(#2e7d32, #6cc070);
		--auf-akzent: light-dark(#ffffff, #0d1528);
		--schatten: 0 18px 45px light-dark(rgb(28 51 91 / 10%), rgb(0 0 0 / 28%));
		--radius: 14px;
		--radius-klein: 9px;
		--inhalt: 1120px;
	}

	/* Übersteuerung durch den Umschalter; ohne data-theme gilt das System. */
	:global(:root[data-theme='hell']) {
		color-scheme: light;
	}

	:global(:root[data-theme='dunkel']) {
		color-scheme: dark;
	}

	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		background:
			radial-gradient(circle at 85% -10%, color-mix(in srgb, var(--akzent) 14%, transparent), transparent 32rem),
			var(--flaeche);
		color: var(--text);
		font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
		-webkit-font-smoothing: antialiased;
	}

	:global(a) {
		color: var(--akzent);
	}

	:global(h1, h2, h3) {
		line-height: 1.2;
		margin: 0;
		text-wrap: balance;
	}

	:global(button, input, select) {
		font: inherit;
	}

	:global(button, a, input, select) {
		-webkit-tap-highlight-color: transparent;
	}

	:global(:focus-visible) {
		outline: 3px solid color-mix(in srgb, var(--akzent) 70%, white);
		outline-offset: 3px;
	}

	:global(::selection) {
		background: color-mix(in srgb, var(--akzent) 28%, transparent);
	}

	/* Zahlen sollen untereinander stehen. */
	:global(.zahl) {
		font-variant-numeric: tabular-nums;
	}

	:global(.hinweis) {
		background: var(--warn-flaeche);
		color: var(--warn);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
		font-size: 0.9rem;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(*) {
			scroll-behavior: auto !important;
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
