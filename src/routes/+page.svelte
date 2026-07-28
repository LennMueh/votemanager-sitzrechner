<script lang="ts">
	import { page } from '$app/state';
	import Thema from '$lib/Thema.svelte';
	import type { Uebersicht, UebersichtEintrag } from '$lib/server/daten';

	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');
	const zusatz = $derived(wahltag ? `?wahltag=${wahltag}` : '');

	let daten = $state<Uebersicht | undefined>();
	let fehler = $state('');
	let suche = $state('');
	let laedt = $state(true);

	async function laden() {
		try {
			const a = await fetch(`/api/uebersicht${zusatz}`);
			const j = await a.json();
			if (!a.ok) throw new Error(j.fehler ?? a.statusText);
			daten = j;
			fehler = '';
		} catch (e) {
			fehler = String(e);
		} finally {
			laedt = false;
		}
	}

	$effect(() => {
		laden();
		const t = setInterval(laden, 30_000);
		return () => clearInterval(t);
	});

	const gefiltert = $derived(
		(daten?.eintraege ?? []).filter((e) =>
			`${e.behoerde} ${e.titel}`.toLowerCase().includes(suche.toLowerCase())
		)
	);

	const gruppen = $derived.by(() => {
		const m = new Map<string, UebersichtEintrag[]>();
		for (const e of gefiltert) {
			if (!m.has(e.behoerde)) m.set(e.behoerde, []);
			m.get(e.behoerde)!.push(e);
		}
		return [...m];
	});

	const gesamt = $derived.by(() => {
		const e = daten?.eintraege ?? [];
		const ein = e.reduce((s, x) => s + (x.stand?.eingegangen ?? 0), 0);
		const erw = e.reduce((s, x) => s + (x.stand?.erwartet ?? 0), 0);
		return { ein, erw, prozent: erw > 0 ? Math.round((ein / erw) * 100) : 0 };
	});

	const link = (e: UebersichtEintrag) =>
		`/v?ags=${e.ags}&wahl=${e.wahlId}&gebiet=${e.gebietId}${wahltag ? `&wahltag=${wahltag}` : ''}`;
</script>

<main>
	<header>
		<div>
			<h1>Sitzrechner Kommunalwahl</h1>
			<p class="unter">
				Landkreis Lüneburg · {wahltag ? `Wahltag ${wahltag}` : '13. September 2026'}
			</p>
		</div>
		<div class="werkzeuge">
			<Thema />
			<a class="knopf" href="/praesentation{zusatz}">Präsentationsmodus →</a>
		</div>
	</header>

	<p class="ohnegewaehr">
		Eigene Berechnung nach dem Niedersächsischen Kommunalwahlgesetz (§§ 36, 37, 45g NKWG)
		auf Grundlage der von votemanager veröffentlichten Zwischenstände. <strong>Ohne Gewähr</strong>
		— amtlich ist allein die Feststellung des Wahlausschusses.
	</p>

	{#if daten}
		<div class="gesamt">
			<strong class="zahl">{gesamt.prozent} %</strong>
			<span>aller Schnellmeldungen im Landkreis ausgezählt</span>
			<span class="zahl klein">({gesamt.ein} von {gesamt.erw})</span>
		</div>
	{/if}

	{#if fehler}
		<p class="hinweis">Daten konnten nicht geladen werden: {fehler}</p>
	{:else if laedt}
		<p class="laedt">Lade Vertretungen …</p>
	{/if}

	{#if daten}
		<input class="suche" type="search" bind:value={suche} placeholder="Vertretung suchen …" />

		{#each gruppen as [behoerde, eintraege] (behoerde)}
			<section>
				<h2>{behoerde}</h2>
				<ul>
					{#each eintraege as e (e.ags + e.wahlId + e.gebietId)}
						{@const p =
							e.stand && e.stand.erwartet > 0
								? Math.round((e.stand.eingegangen / e.stand.erwartet) * 100)
								: 0}
						<li>
							<a href={link(e)}>
								<span class="titel">{e.titel}</span>
								<span class="meta">
									{#if e.direktwahl}
										<span class="marke">Direktwahl</span>
									{:else if e.sitze}
										<span class="marke">{e.sitze} Sitze</span>
									{:else}
										<span class="marke fehlt">Sitzzahl fehlt</span>
									{/if}
									<span class="zahl stand">{e.stand?.text ?? '—'}</span>
								</span>
								<span class="balken"><span style:width="{p}%" class:fertig={p >= 100}></span></span>
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</main>

<style>
	main {
		max-width: 1000px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: space-between;
		align-items: center;
	}

	h1 {
		font-size: 1.7rem;
	}

	.unter {
		margin: 0.25rem 0 0;
		color: var(--text-2);
	}

	.werkzeuge {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.knopf {
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		padding: 0.5rem 0.9rem;
		text-decoration: none;
		background: var(--flaeche-2);
	}

	.ohnegewaehr {
		font-size: 0.85rem;
		color: var(--text-2);
		border-left: 3px solid var(--rand);
		padding-left: 0.8rem;
		margin: 1.25rem 0;
	}

	.gesamt {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		padding: 0.9rem 1.1rem;
		margin-bottom: 1.25rem;
	}

	.gesamt strong {
		font-size: 1.6rem;
	}

	.klein {
		color: var(--text-3);
		font-size: 0.85rem;
	}

	.suche {
		width: 100%;
		padding: 0.6rem 0.8rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		background: var(--flaeche);
		color: var(--text);
		font: inherit;
		margin-bottom: 1.5rem;
	}

	section {
		margin-bottom: 1.75rem;
	}

	h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
		margin-bottom: 0.5rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}

	li a {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.3rem 1rem;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		background: var(--flaeche);
	}

	li a:hover {
		background: var(--flaeche-2);
	}

	.titel {
		font-weight: 500;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.82rem;
		color: var(--text-2);
	}

	.marke {
		border: 1px solid var(--rand);
		border-radius: 99px;
		padding: 0 0.5rem;
		white-space: nowrap;
	}

	.marke.fehlt {
		color: var(--warn);
		background: var(--warn-flaeche);
		border-color: transparent;
	}

	.stand {
		white-space: nowrap;
	}

	.balken {
		grid-column: 1 / -1;
		height: 4px;
		background: var(--flaeche-2);
		border-radius: 99px;
		overflow: hidden;
	}

	.balken span {
		display: block;
		height: 100%;
		background: var(--akzent);
	}

	.balken span.fertig {
		background: #2e7d32;
	}

	.laedt {
		color: var(--text-2);
	}
</style>
