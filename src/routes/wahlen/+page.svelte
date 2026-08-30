<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	onMount(() => goto(`/?ansicht=wahlen${location.search ? `&${location.search.slice(1)}` : ''}`));
</script>
<svelte:head><title>Wahlen durchsuchen — Votemanager Viewer</title></svelte:head>
<p style="padding:2rem">Wahlübersicht wird geladen …</p>
