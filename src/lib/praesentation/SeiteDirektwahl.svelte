<script lang="ts">
	import type { Direktergebnis } from '$lib/nkwg';

	let { direkt }: { direkt: Direktergebnis } = $props();

	const fmt = new Intl.NumberFormat('de-DE');
	const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

	const stichwahlNamen = $derived(new Set((direkt.stichwahl ?? []).map((b) => b.name)));

	/*
	 * Feste Skala 0 bis 100 %: nur so liegt die 50-%-Marke immer in der Spur.
	 * Eine Skalierung auf den Stärksten hätte sie aus dem Bild geschoben —
	 * und genau an dieser Schwelle entscheidet sich Wahl oder Stichwahl.
	 * Kurze Balken sind dann selbst die Aussage: niemand ist nah an der Mehrheit.
	 */

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

	<ul class="balken">
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
					<!-- Die 50-%-Linie entscheidet nach § 45g über Wahl oder Stichwahl. -->
					<span class="haelfte"></span>
				</span>
				<span class="werte zahl">
					<strong>{pct.format(b.prozent)} %</strong>
					<span class="stimmen">{fmt.format(b.stimmen)}</span>
				</span>
			</li>
		{/each}
	</ul>

	<p class="legende">
		Gestrichelte Linie: 50 % der gültigen Stimmen — wer sie überschreitet, ist nach
		§ 45g NKWG im ersten Wahlgang gewählt.
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

	.balken {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: calc(0.6rem * var(--skala));
		/* Mittig statt verteilt: bei nur zwei Bewerbern rissen sonst riesige
		   Lücken zwischen die Balken. */
		align-content: center;
		flex: 1;
		min-height: 0;
	}

	li {
		display: grid;
		grid-template-columns: minmax(8rem, 22%) 1fr auto;
		align-items: center;
		gap: calc(0.9rem * var(--skala));
		font-size: calc(1.15rem * var(--skala));
	}

	.name {
		overflow-wrap: anywhere;
		line-height: 1.2;
	}

	.spur {
		position: relative;
		height: calc(2rem * var(--skala));
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: calc(0.35rem * var(--skala));
		overflow: hidden;
	}

	.fuellung {
		display: block;
		height: 100%;
		/* Runder Abschluss am Datenende, bündig zur Grundlinie. */
		border-radius: 0 calc(0.35rem * var(--skala)) calc(0.35rem * var(--skala)) 0;
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
		font-size: calc(1.25rem * var(--skala));
	}

	.stimmen {
		display: block;
		color: var(--text-3);
		font-size: calc(0.85rem * var(--skala));
	}

	li.gewaehlt .name,
	li.stichwahl .name {
		font-weight: 700;
	}

	li.gewaehlt .spur {
		outline: calc(0.18rem * var(--skala)) solid var(--gut);
		outline-offset: 2px;
	}

	li.stichwahl .spur {
		outline: calc(0.14rem * var(--skala)) solid var(--akzent);
		outline-offset: 2px;
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
		li { grid-template-columns: minmax(0, 1fr) auto; gap: calc(.4rem * var(--skala)); }
		.spur { grid-column: 1 / -1; grid-row: 2; }
		.werte { grid-column: 2; grid-row: 1; }
		.stimmen { display: none; }
		.legende { font-size: calc(.78rem * var(--skala)); }
	}
</style>
