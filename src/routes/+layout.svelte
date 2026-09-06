<script lang="ts">
	import '../app.css';
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
		font-size: var(--schrift-s);
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
</style>
