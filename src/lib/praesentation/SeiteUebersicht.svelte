<script lang="ts">
	import Sitzdiagramm from '$lib/Sitzdiagramm.svelte';
	import type { Sitzverteilung } from '$lib/nkwg';

	let { verteilung }: { verteilung: Sitzverteilung } = $props();

	const mitSitzen = $derived(verteilung.parteien.filter((p) => p.sitze > 0));
	const unbesetzt = $derived(verteilung.sitze.filter((s) => s.unbesetzt).length);
</script>

<div class="seite">
	<!-- Sitzanzahl je Wahlvorschlag, im Klartext — nicht nur über die Farbe. -->
	<ul class="leiste">
		{#each mitSitzen as p (p.partei)}
			<li>
				<span class="punkt" style:background={p.farbe ?? 'var(--text-3)'}></span>
				<span class="name">{p.partei}</span>
				<strong class="zahl">{p.sitze}</strong>
			</li>
		{/each}
		{#if unbesetzt}
			<li>
				<span class="punkt leer"></span>
				<span class="name">unbesetzt</span>
				<strong class="zahl">{unbesetzt}</strong>
			</li>
		{/if}
	</ul>

	<div class="diagramm">
		<Sitzdiagramm sitze={verteilung.sitze} groesse={1400} />
	</div>

	{#if verteilung.losentscheide.length}
		<p class="los">
			{verteilung.losentscheide.length === 1 ? 'An einer Stelle' : 'An mehreren Stellen'}
			entscheidet das Los — die angezeigte Auswahl ist insoweit nur provisorisch.
		</p>
	{/if}
</div>

<style>
	.seite {
		display: flex;
		flex-direction: column;
		height: 100%;
		gap: calc(1rem * var(--skala));
	}

	.leiste {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: calc(0.5rem * var(--skala)) calc(1.8rem * var(--skala));
		flex: none;
	}

	.leiste li {
		display: flex;
		align-items: center;
		gap: calc(0.5rem * var(--skala));
		font-size: calc(1.5rem * var(--skala));
	}

	.punkt {
		width: calc(1.05rem * var(--skala));
		height: calc(1.05rem * var(--skala));
		border-radius: 50%;
		flex: none;
		/* Ring gegen den Untergrund: hält CDU-Schwarz auch im Dunkelmodus sichtbar. */
		box-shadow: 0 0 0 1px var(--rand);
	}

	.punkt.leer {
		background: transparent;
		box-shadow: none;
		border: 2px dashed var(--text-3);
	}

	.name {
		color: var(--text-2);
	}

	.leiste strong {
		font-size: calc(2rem * var(--skala));
		line-height: 1;
	}

	.diagramm {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Volle Fläche plus preserveAspectRatio (Vorgabe des SVG): das Diagramm
	   wird eingepasst statt verzerrt, und kann nicht überlaufen. */
	.diagramm :global(svg) {
		width: 100%;
		height: 100%;
	}

	.los {
		margin: 0;
		text-align: center;
		color: var(--warn);
		font-size: calc(1rem * var(--skala));
		flex: none;
	}
</style>
