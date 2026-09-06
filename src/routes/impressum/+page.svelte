<script lang="ts">
	import Zurueck from '$lib/stil/Zurueck.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Impressum — Votemanager Viewer</title></svelte:head>

<main>
	<Zurueck href="/">← Zur Übersicht</Zurueck>

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

</style>
