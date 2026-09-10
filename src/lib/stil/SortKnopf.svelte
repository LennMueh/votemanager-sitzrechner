<script lang="ts">
	// Der Knopf im Spaltenkopf, nicht der Kopf selbst: ein <th> aus dieser Datei
	// bekäme die Tabellenregeln der Seite nicht, weil Svelte das CSS je
	// Komponente abgrenzt. aria-sort setzt deshalb die Seite am <th>, über
	// ariaSort() aus $lib/sortierung.
	import type { Snippet } from 'svelte';
	import { umschalten, type Sortierung } from '$lib/sortierung';

	let {
		sortierung = $bindable(),
		spalte,
		absteigend = false,
		children
	}: {
		sortierung: Sortierung;
		spalte: string;
		/** Richtung beim ersten Klick: Zahlen absteigend, Text aufsteigend. */
		absteigend?: boolean;
		children: Snippet;
	} = $props();

	const pfeil = $derived(
		sortierung?.spalte !== spalte ? '↕' : sortierung.absteigend ? '▼' : '▲'
	);
</script>

<button type="button" onclick={() => (sortierung = umschalten(sortierung, spalte, absteigend))}>
	{@render children()}<span class="pfeil" aria-hidden="true">{pfeil}</span>
</button>

<style>
	/* Der Knopf sieht aus wie der Kopf, in dem er steht. Browser setzen
	   text-transform und letter-spacing an Knöpfen zurück; ohne inherit fiele die
	   Großschreibung der Tabellenköpfe weg. */
	button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 44px;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		color: inherit;
		text-align: inherit;
		text-transform: inherit;
		letter-spacing: inherit;
		cursor: pointer;
	}
	button:hover {
		color: var(--text);
	}
	.pfeil {
		color: var(--text-3);
	}
</style>
