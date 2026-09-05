<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();

	// Der Präsentationsmodus bleibt ohne Fußzeile: Buehne.svelte misst den Inhalt
	// und stellt --skala danach ein. Ein Footer ginge in diese Messung ein und
	// verkleinerte die Bühne auf jedem Beamer.
	let fusszeile = $derived(!page.url.pathname.startsWith('/praesentation'));
</script>

<svelte:head>
	<title>Votemanager Viewer</title>
</svelte:head>

{@render children()}

{#if fusszeile}
	<footer>
		<span>Berechnete Sitzverteilung, keine amtliche Verlautbarung.</span>
		<nav>
			<a href="/impressum">Impressum</a>
			<a href="/datenschutz">Datenschutz</a>
		</nav>
	</footer>
{/if}

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

	footer {
		max-width: var(--inhalt);
		margin: 0 auto;
		padding: 1.25rem clamp(1rem, 3vw, 1.5rem) 2rem;
		border-top: 1px solid var(--rand);
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1.25rem;
		justify-content: space-between;
		align-items: center;
		font-size: 0.85rem;
		color: var(--text-2);
	}

	footer nav {
		display: flex;
		gap: 1.25rem;
	}

	footer a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	/* Impressum und Datenschutzerklärung kommen als gerendertes Markdown und
	   damit über {@html}. Sveltes Bereichsbindung erfasst solchen Inhalt nicht,
	   deshalb müssen die Regeln global stehen — und weil hier ohnehin alle
	   globalen Stile liegen, stehen sie hier statt doppelt in beiden Seiten.
	   Die globale Regel setzt h1..h3 auf margin: 0; ein Fließtext braucht die
	   Abstände zurück. */
	/* Deutsche Komposita sprengen schmale Anzeigen: „Datenschutzerklärung" ist
	   als h1 breiter als 320 px. Der Umbruch macht aus dem Überlauf eine
	   Trennung; hyphens greift, weil <html lang="de"> gesetzt ist. */
	:global(.rechtstext h1),
	:global(.rechtstext h2),
	:global(.rechtstext h3) {
		overflow-wrap: break-word;
		hyphens: auto;
	}

	:global(.rechtstext h1) {
		font-size: clamp(1.7rem, 4vw, 2.3rem);
		margin-bottom: 1.5rem;
	}

	:global(.rechtstext h2) {
		font-size: 1.15rem;
		margin: 2.25rem 0 0.6rem;
	}

	:global(.rechtstext h3) {
		font-size: 1rem;
		margin: 1.5rem 0 0.4rem;
	}

	:global(.rechtstext p),
	:global(.rechtstext ul),
	:global(.rechtstext ol) {
		margin: 0 0 1rem;
	}

	:global(.rechtstext li) {
		margin-bottom: 0.35rem;
	}

	:global(.rechtstext blockquote) {
		margin: 1rem 0;
		padding-left: 0.8rem;
		border-left: 3px solid var(--rand);
		color: var(--text-2);
	}

	:global(.rechtstext code) {
		background: var(--flaeche-2);
		border-radius: var(--radius-klein);
		padding: 0.1em 0.35em;
		font-size: 0.9em;
	}

	/* Lange Adressen und URLs dürfen die Textspalte nicht sprengen. */
	:global(.rechtstext a) {
		overflow-wrap: anywhere;
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
