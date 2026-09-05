<script lang="ts">
	let { data } = $props();
</script>

<svelte:head><title>Impressum — Votemanager Viewer</title></svelte:head>

<main>
	<a class="zurueck" href="/">← Zur Übersicht</a>

	{#if data.html}
		<article class="rechtstext">{@html data.html}</article>
	{:else}
		<h1>Impressum</h1>
		<p class="hinweis">
			<strong>Dieser Text ist noch nicht hinterlegt.</strong> Die Seite erfüllt
			§ 5 DDG derzeit nicht.
		</p>
	{/if}
</main>

<style>
	main {
		max-width: 46rem;
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem) 4rem;
	}

	.zurueck {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-bottom: 1.25rem;
		text-decoration: none;
		font-size: 0.9rem;
	}
</style>
