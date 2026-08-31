<script lang="ts">
	import Sitzdiagramm from '$lib/Sitzdiagramm.svelte';
	import type { Sitzverteilung } from '$lib/nkwg';

	let { verteilung }: { verteilung: Sitzverteilung } = $props();

	const mitSitzen = $derived(verteilung.parteien.filter((p) => p.sitze > 0));
	// Nach Wahlvorschlag gruppiert statt zu einer Zahl summiert: erst so trägt die
	// Farbe des unbesetzten Sitzes eine Aussage — § 36 Abs. 7 trifft eine Liste.
	const unbesetztJePartei = $derived.by(() => {
		const m = new Map<string, { partei: string; farbe?: string; anzahl: number }>();
		for (const s of verteilung.sitze) {
			if (!s.unbesetzt) continue;
			const e = m.get(s.partei) ?? { partei: s.partei, farbe: s.farbe, anzahl: 0 };
			e.anzahl++;
			m.set(s.partei, e);
		}
		return [...m.values()];
	});

	/** „A", „A und B", „A, B und C" — Beteiligte eines Losentscheids lesbar aufzählen. */
	const und = (x: string[]) =>
		x.length > 1 ? `${x.slice(0, -1).join(', ')} und ${x.at(-1)}` : (x[0] ?? '');
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
		{#each unbesetztJePartei as u (u.partei)}
			<li>
				<span class="punkt leer" style:--farbe={u.farbe ?? 'var(--text-3)'}></span>
				<span class="name">{u.partei ? `${u.partei} unbesetzt` : 'unbesetzt'}</span>
				<strong class="zahl">{u.anzahl}</strong>
			</li>
		{/each}
	</ul>

	<div class="diagramm">
		<Sitzdiagramm sitze={verteilung.sitze} groesse={1400} />
	</div>

	<!-- Auf der Leinwand die Beteiligten nennen: „an einer Stelle entscheidet das
	     Los" sagt niemandem, wessen Mandat wackelt. -->
	{#if verteilung.losfaelle.length}
		<ul class="los">
			{#each verteilung.losfaelle as l, i (l.kontext + i)}
				<li>
					Das Los entscheidet{l.betroffene.length ? ` zwischen ${und(l.betroffene)}` : ''} —
					{l.kontext}. Vorläufig: {und(l.vorlaeufig) || 'niemand'}.
				</li>
			{/each}
		</ul>
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

	/* Schraffur und gestrichelter Rand bleiben das Unterscheidungsmerkmal; die
	   Farbe zeigt zusätzlich, welchem Wahlvorschlag der Sitz zugefallen wäre. Der
	   Name steht daneben — nie Farbe allein. Die Streifen skalieren mit --skala,
	   sonst verschwinden sie auf der Leinwand. */
	.punkt.leer {
		background: repeating-linear-gradient(
			45deg,
			var(--farbe, var(--text-3)) 0 calc(0.13rem * var(--skala)),
			transparent calc(0.13rem * var(--skala)) calc(0.26rem * var(--skala))
		);
		box-shadow: none;
		border: 2px dashed var(--farbe, var(--text-3));
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
		padding: 0;
		list-style: none;
		display: grid;
		gap: calc(0.25rem * var(--skala));
		text-align: center;
		color: var(--warn);
		font-size: calc(1rem * var(--skala));
		flex: none;
	}
</style>
