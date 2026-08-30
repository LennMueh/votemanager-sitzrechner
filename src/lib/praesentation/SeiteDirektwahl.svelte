<script lang="ts">
	import type { Direktergebnis } from '$lib/nkwg';
	import Direktbalken from '$lib/Direktbalken.svelte';

	let {
		direkt,
		/** Rechtsgrundlage der Mehrheitsregel — Landesrecht, siehe wahlrecht/. */
		rechtsgrundlage = ''
	}: { direkt: Direktergebnis; rechtsgrundlage?: string } = $props();

	const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<div class="seite">
	<p class="satz">
		{#if direkt.gewaehlt}
			<strong>{direkt.gewaehlt.name}</strong> ist mit
			<span class="zahl">{pct.format(direkt.bewerber[0].prozent)} %</span> gewählt.
		{:else if direkt.stichwahl}
			Keine absolute Mehrheit — <strong>Stichwahl</strong> zwischen
			<strong>{direkt.stichwahl[0]?.name}</strong> und <strong>{direkt.stichwahl[1]?.name}</strong>.
		{:else}
			Noch keine Stimmen ausgezählt.
		{/if}
	</p>

	<Direktbalken {direkt} gross />

	<p class="legende">
		Gestrichelte Linie: 50 % der gültigen Stimmen — wer sie überschreitet, ist im
		ersten Wahlgang gewählt{rechtsgrundlage ? ` (${rechtsgrundlage})` : ''}.
	</p>

	{#if direkt.losentscheid}
		<p class="los">{direkt.losentscheid} — es entscheidet das Los.
			{#if direkt.losfall?.vorlaeufig.length} Provisorisch angezeigt: {direkt.losfall.vorlaeufig.join(', ')}.{/if}
		</p>
	{/if}
</div>

<style>
	.seite {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: calc(0.9rem * var(--skala));
	}

	.satz {
		margin: 0;
		font-size: calc(1.5rem * var(--skala));
		flex: none;
	}

	.legende,
	.los {
		margin: 0;
		font-size: calc(0.9rem * var(--skala));
		color: var(--text-3);
		flex: none;
	}

	.los {
		color: var(--warn);
	}

	@media (max-width: 680px) {
		.legende { font-size: calc(.78rem * var(--skala)); }
	}
</style>
