<script lang="ts">
	import type { Direktergebnis } from './nkwg';

	// Gemeinsame Balkendarstellung für Detailansicht und Beamer. `gross` folgt
	// demselben Muster wie Stimmverhaeltnis.svelte: Grundgrößen in rem, im
	// Präsentationsmodus über --skala hochgerechnet.
	let { direkt, gross = false }: { direkt: Direktergebnis; gross?: boolean } = $props();

	const stichwahlNamen = $derived(new Set((direkt.stichwahl ?? []).map((b) => b.name)));

	const fmt = new Intl.NumberFormat('de-DE');
	const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<ul class="balken" class:gross>
	{#each direkt.bewerber as b (b.name)}
		<li
			class:gewaehlt={direkt.gewaehlt?.name === b.name}
			class:stichwahl={!direkt.gewaehlt && stichwahlNamen.has(b.name)}
		>
			<span class="name">{b.name}</span>
			<span class="spur">
				<span
					class="fuellung"
					style:width="{b.prozent}%"
					style:background={b.farbe ?? 'var(--akzent)'}
				></span>
				<!-- Die 50-%-Linie entscheidet über Wahl oder Stichwahl. -->
				<span class="haelfte"></span>
			</span>
			<span class="werte zahl">
				<strong>{pct.format(b.prozent)} %</strong>
				<span class="stimmen">{fmt.format(b.stimmen)}</span>
			</span>
		</li>
	{/each}
</ul>

<style>
	.balken {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}

	li {
		display: grid;
		grid-template-columns: minmax(8rem, 22%) 1fr auto;
		align-items: center;
		gap: 0.75rem;
	}

	.name {
		overflow-wrap: anywhere;
		line-height: 1.2;
	}

	.spur {
		position: relative;
		height: 1.6rem;
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: 0.3rem;
		overflow: hidden;
	}

	.fuellung {
		display: block;
		height: 100%;
		border-radius: 0 0.3rem 0.3rem 0;
		box-shadow: 0 0 0 1px var(--rand) inset;
		transition: width 0.5s ease;
	}

	.haelfte {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 0;
		border-left: 2px dashed var(--text-2);
	}

	.werte {
		text-align: right;
		white-space: nowrap;
	}

	.werte strong {
		font-size: 1.05rem;
	}

	.stimmen {
		display: block;
		color: var(--text-3);
		font-size: 0.85em;
	}

	li.gewaehlt .name,
	li.stichwahl .name {
		font-weight: 700;
	}

	li.gewaehlt .spur {
		outline: 0.14rem solid var(--gut);
		outline-offset: 2px;
	}

	li.stichwahl .spur {
		outline: 0.12rem solid var(--akzent);
		outline-offset: 2px;
	}

	/* Beamer: dieselbe Darstellung, an --skala gehängt. */
	.gross { gap: calc(0.6rem * var(--skala)); align-content: center; flex: 1; min-height: 0; }
	.gross li { gap: calc(0.9rem * var(--skala)); font-size: calc(1.15rem * var(--skala)); }
	.gross .spur { height: calc(2rem * var(--skala)); border-radius: calc(0.35rem * var(--skala)); }
	.gross .fuellung { border-radius: 0 calc(0.35rem * var(--skala)) calc(0.35rem * var(--skala)) 0; }
	.gross .werte strong { font-size: calc(1.25rem * var(--skala)); }
	.gross .stimmen { font-size: calc(0.85rem * var(--skala)); }
	.gross li.gewaehlt .spur { outline-width: calc(0.18rem * var(--skala)); }
	.gross li.stichwahl .spur { outline-width: calc(0.14rem * var(--skala)); }

	@media (max-width: 680px) {
		li { grid-template-columns: minmax(0, 1fr) auto; gap: 0.4rem; }
		.gross li { gap: calc(0.4rem * var(--skala)); }
		.spur { grid-column: 1 / -1; grid-row: 2; }
		.werte { grid-column: 2; grid-row: 1; }
		.stimmen { display: none; }
	}
</style>
