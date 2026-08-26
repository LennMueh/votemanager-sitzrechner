<script lang="ts">
	import type { Sitz, Sitzverteilung } from '$lib/nkwg';

	let {
		verteilung,
		/** Schlüssel „Partei|Name" der seit dem letzten Stand neu Gewählten. */
		neu = new Set<string>(),
		weg = []
	}: {
		verteilung: Sitzverteilung;
		neu?: Set<string>;
		weg?: { partei: string; name: string }[];
	} = $props();

	interface Gruppe {
		partei: string;
		farbe?: string;
		sitze: number;
		mitglieder: Sitz[];
		weg: string[];
	}

	const gruppen = $derived.by((): Gruppe[] =>
		verteilung.parteien
			.filter((p) => p.sitze > 0)
			.map((p) => ({
				partei: p.partei,
				farbe: p.farbe,
				sitze: p.sitze,
				mitglieder: verteilung.sitze.filter((s) => s.partei === p.partei),
				weg: weg.filter((w) => w.partei === p.partei).map((w) => w.name)
			}))
	);

	/** Kennzeichen der Mandatsart — Wort plus Form, nie nur Farbe. */
	function kennzeichen(s: Sitz): string {
		if (s.unbesetzt) return 'unbesetzt';
		if (s.art === 'liste') return 'Liste';
		if (s.art === 'uebertrag') return 'Übertrag';
		return 'direkt';
	}
</script>

<div class="gruppen">
	{#each gruppen as g (g.partei)}
		<section class="gruppe" class:breit={g.mitglieder.length > 8}>
			<h2 style:--farbe={g.farbe ?? 'var(--text-3)'}>
				<span class="strich"></span>
				<span class="partei">{g.partei}</span>
				<span class="anzahl zahl">{g.sitze}</span>
			</h2>

			<ul>
				{#each g.mitglieder as m, i (m.name ?? 'leer' + i)}
					<li
						class:unbesetzt={m.unbesetzt}
						class:neu={m.name && neu.has(`${m.partei}|${m.name}`)}
					>
						<span class="person">{m.unbesetzt ? 'Sitz unbesetzt' : m.name}</span>
						<span class="art" class:liste={m.art === 'liste'}>
							<span class="marke" class:hohl={m.art !== 'personenwahl'}></span>
							{kennzeichen(m)}
						</span>
					</li>
				{/each}
			</ul>

			{#if g.weg.length}
				<p class="weg">nicht mehr dabei: {g.weg.join(', ')}</p>
			{/if}
		</section>
	{/each}
</div>

<style>
	/*
	 * Raster statt Spaltensatz: `columns` schiebt zu viel Inhalt seitlich in
	 * unsichtbare Spalten — dann fehlen ganze Fraktionen, ohne dass eine
	 * Höhenmessung das bemerkt. Im Raster wächst der Inhalt nach unten, damit
	 * greift die Verkleinerung in Buehne.svelte zuverlässig.
	 */
	.gruppen {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(calc(13rem * var(--skala)), 1fr));
		align-items: start;
		/* Bewusst KEIN height:100% mit align-content:center — das lässt die
		   Gruppen überlappen und versteckt den Überlauf zugleich vor der
		   Messung in Buehne.svelte. Lieber oben bündig und ehrlich. */
		gap: calc(1rem * var(--skala)) calc(1.1rem * var(--skala));
	}

	/* Große Fraktionen über zwei Spalten, sonst bestimmt eine 16er-Liste die
	   Höhe der ganzen Zeile und alles andere schrumpft mit. */
	.gruppe.breit {
		grid-column: span 2;
	}

	h2 {
		display: flex;
		align-items: center;
		gap: calc(0.45rem * var(--skala));
		font-size: calc(1.15rem * var(--skala));
		margin-bottom: calc(0.35rem * var(--skala));
	}

	.strich {
		width: calc(0.32rem * var(--skala));
		align-self: stretch;
		min-height: calc(1.2rem * var(--skala));
		background: var(--farbe);
		border-radius: 99px;
		box-shadow: 0 0 0 1px var(--rand);
		flex: none;
	}

	.partei {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.anzahl {
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: 99px;
		padding: 0 calc(0.5rem * var(--skala));
		font-size: calc(0.95rem * var(--skala));
		flex: none;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: calc(0.28rem * var(--skala));
	}

	/* In einer breiten Gruppe stehen die Kacheln zweispaltig — so bleibt eine
	   16er-Fraktion halb so hoch. */
	.gruppe.breit ul {
		grid-template-columns: 1fr 1fr;
	}

	li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: calc(0.5rem * var(--skala));
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: calc(0.5rem * var(--skala));
		padding: calc(0.32rem * var(--skala)) calc(0.6rem * var(--skala));
	}

	.person {
		font-size: calc(1.02rem * var(--skala));
		line-height: 1.25;
		overflow-wrap: anywhere;
	}

	.art {
		display: flex;
		align-items: center;
		gap: calc(0.28rem * var(--skala));
		color: var(--text-3);
		font-size: calc(0.78rem * var(--skala));
		white-space: nowrap;
		flex: none;
	}

	/* Gefüllt = über Personenstimmen, hohl = über die Liste. Das Wort steht
	   immer daneben, die Form ist nur die Zugabe. */
	.marke {
		width: calc(0.5rem * var(--skala));
		height: calc(0.5rem * var(--skala));
		border-radius: 50%;
		background: var(--text-2);
		flex: none;
	}

	.marke.hohl {
		background: transparent;
		border: 1px solid var(--text-3);
	}

	li.unbesetzt {
		border-style: dashed;
		background: transparent;
	}

	li.unbesetzt .person {
		color: var(--text-3);
		font-style: italic;
	}

	li.neu {
		border-color: var(--akzent);
		background: color-mix(in srgb, var(--akzent) 16%, transparent);
	}

	.weg {
		margin: calc(0.3rem * var(--skala)) 0 0;
		color: var(--warn);
		font-size: calc(0.78rem * var(--skala));
	}

	@media (max-width: 680px) {
		.gruppen { grid-template-columns: 1fr; }
		.gruppe.breit { grid-column: auto; }
		.gruppe.breit ul { grid-template-columns: 1fr; }
	}
</style>
