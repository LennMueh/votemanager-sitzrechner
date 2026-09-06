<script lang="ts">
	import Zurueck from '$lib/stil/Zurueck.svelte';
	let { data } = $props();
</script>

<svelte:head><title>Datenschutzerklärung — Votemanager Viewer</title></svelte:head>

<main>
	<Zurueck href="/">← Zur Übersicht</Zurueck>

	{#if data.html}
		<article class="rechtstext">{@html data.html}</article>
	{:else}
		<h1>Datenschutzerklärung</h1>
		<p class="hinweis">
			<strong>Dieser Text ist noch nicht hinterlegt.</strong> Die Seite erfüllt
			Art. 13 DSGVO derzeit nicht.
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
