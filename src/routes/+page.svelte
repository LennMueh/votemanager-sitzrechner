<script lang="ts">
	import { page } from '$app/state';
	import Thema from '$lib/Thema.svelte';
	import WahlAuswahl from '$lib/WahlAuswahl.svelte';
	import { strom } from '$lib/strom';
	import type { Uebersicht, UebersichtEintrag } from '$lib/server/daten';

	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');
	const zusatz = $derived(wahltag ? `?wahltag=${wahltag}` : '');

	let daten = $state<Uebersicht | undefined>();
	let fehler = $state('');
	let suche = $state('');
	let laedt = $state(true);
	let land = $state('');
	let region = $state('');
	let behoerde = $state('');

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
		return strom(['uebersicht'], () => laden());
	});

	const gefiltert = $derived(
		(daten?.eintraege ?? []).filter((e) =>
			(!land || e.land === land) && (!region || e.region === region) && (!behoerde || e.ags === behoerde) && `${e.behoerde} ${e.titel}`.toLowerCase().includes(suche.toLowerCase())
		)
	);
	const eindeutig = (x: string[]) => [...new Set(x)].sort((a, b) => a.localeCompare(b, 'de'));
	const laender = $derived(eindeutig((daten?.eintraege ?? []).map((e) => e.land)));
	const regionen = $derived(eindeutig((daten?.eintraege ?? []).filter((e) => !land || e.land === land).map((e) => e.region)));
	const behoerden = $derived(eindeutig((daten?.eintraege ?? []).filter((e) => (!land || e.land === land) && (!region || e.region === region)).map((e) => e.ags)));
	const name = (ags: string) => daten?.eintraege.find((e) => e.ags === ags)?.behoerde ?? ags;
	const regionName = (r: string) => daten?.eintraege.find((e) => e.region === r)?.regionName ?? r;

	const gesamt = $derived.by(() => {
		const e = daten?.eintraege ?? [];
		const ein = e.reduce((s, x) => s + (x.stand?.eingegangen ?? 0), 0);
		const erw = e.reduce((s, x) => s + (x.stand?.erwartet ?? 0), 0);
		return { ein, erw, prozent: erw > 0 ? Math.round((ein / erw) * 100) : 0 };
	});

	const link = (e: UebersichtEintrag) =>
		`/v?${e.instanzId ? `instanz=${e.instanzId}` : `ags=${e.ags}`}&wahl=${e.wahlId}&gebiet=${e.gebietId}${wahltag ? `&wahltag=${wahltag}` : ''}`;
</script>

<main>
	<header>
		<div>
			<p class="kicker">Wahlabend 2026</p>
			<h1>Sitzrechner Kommunalwahl</h1>
			<p class="unter">
				Landkreis Lüneburg · {wahltag ? `Wahltag ${wahltag}` : '13. September 2026'}
			</p>
		</div>
		<div class="werkzeuge">
			<Thema />
			<a class="knopf" href="/praesentation{zusatz}">Präsentation starten →</a>
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
		<input class="suche" type="search" bind:value={suche} placeholder="Vertretung suchen …" aria-label="Vertretung suchen" />

		<nav class="hierarchie" aria-label="Wahlebene">
			{#if !land}<div class="karten">{#each laender as x}<button onclick={() => (land = x)}>{x}</button>{/each}</div>
			{:else if !region}<button class="zurueck" onclick={() => (land = '')}>← Bundesländer</button><div class="karten">{#each regionen as x}<button onclick={() => (region = x)}>{regionName(x)}</button>{/each}</div>
			{:else if !behoerde}<button class="zurueck" onclick={() => (region = '')}>← Regionen</button><div class="karten">{#each behoerden as x}<button onclick={() => (behoerde = x)}>{name(x)}</button>{/each}</div>
			{:else}<button class="zurueck" onclick={() => (behoerde = '')}>← Behörden</button>
			<section>
				<h2>{name(behoerde)}</h2>
				<ul>
					{#each gefiltert as e (e.ags + e.wahlId + e.gebietId)}
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
							<a class="vergleich" href={`/vergleich?ags=${e.ags}&wahl=${e.wahlId}&gebiet=${e.gebietId}&jahr=${wahltag || '20260913'}`}>2026 ↔ 2021</a>
						</li>
					{/each}
				</ul>
			</section>
			{/if}
		</nav>

		{#if gefiltert.length === 0}
			<p class="leer" role="status">Keine Vertretung passt zur Suche.</p>
		{/if}
	{/if}

	<details class="praesentationsauswahl">
		<summary>Individuelle Präsentation zusammenstellen</summary>
		<WahlAuswahl titel="Wahlen für die Präsentation auswählen" />
	</details>
</main>

<style>
	main {
		max-width: var(--inhalt);
		margin: 0 auto;
		padding: clamp(1.25rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem) 5rem;
	}

	header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: space-between;
		align-items: center;
	}

	h1 {
		font-size: clamp(2rem, 5vw, 3.6rem);
		letter-spacing: -0.045em;
	}

	.kicker { margin: 0 0 .35rem; color: var(--akzent); font-size: .78rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }

	.unter {
		margin: 0.25rem 0 0;
		color: var(--text-2);
	}

	.werkzeuge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.knopf {
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0.55rem 0.95rem;
		text-decoration: none;
		background: var(--akzent);
		color: var(--auf-akzent);
		font-weight: 700;
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
		background: linear-gradient(120deg, color-mix(in srgb, var(--akzent) 15%, var(--flaeche)), var(--flaeche-2));
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		padding: clamp(1rem, 3vw, 1.5rem);
		margin-bottom: 1.25rem;
	}

	.gesamt strong {
		font-size: clamp(1.8rem, 5vw, 2.8rem);
		color: var(--akzent);
	}

	.klein {
		color: var(--text-3);
		font-size: 0.85rem;
	}

	.suche {
		width: 100%;
		min-height: 48px;
		padding: 0.7rem 0.9rem;
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

	.hierarchie { display: grid; gap: .75rem; }
	.karten { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; }
	.karten button, .zurueck { min-height: 64px; padding: 1rem; border: 1px solid var(--rand); border-radius: var(--radius); background: var(--flaeche); color: var(--text); text-align: left; font: inherit; cursor: pointer; }
	.zurueck { min-height: 44px; padding: .55rem .8rem; }
	.vergleich { display: inline-flex; margin-top: .45rem; font-size: .8rem; }

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
		padding: 0.85rem 1rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		background: color-mix(in srgb, var(--flaeche) 92%, transparent);
		box-shadow: 0 6px 18px color-mix(in srgb, var(--text) 5%, transparent);
		transition: border-color .15s ease, transform .15s ease, background .15s ease;
	}

	li a:hover, li a:focus-visible {
		background: var(--flaeche-2);
		border-color: color-mix(in srgb, var(--akzent) 55%, var(--rand));
		transform: translateY(-1px);
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

	.leer { padding: 2rem; text-align: center; color: var(--text-2); border: 1px dashed var(--rand); border-radius: var(--radius); }

	.praesentationsauswahl { margin-top: 3rem; border-top: 1px solid var(--rand); padding-top: 1.25rem; }
	.praesentationsauswahl summary { min-height: 44px; display: flex; align-items: center; color: var(--text-2); font-weight: 700; cursor: pointer; }
	.praesentationsauswahl[open] summary { color: var(--text); }

	@media (max-width: 680px) {
		header { align-items: flex-start; }
		.werkzeuge { width: 100%; justify-content: space-between; }
		.gesamt { align-items: flex-start; flex-wrap: wrap; }
		.gesamt strong { width: 100%; }
		li a { grid-template-columns: 1fr; }
		.meta { justify-content: space-between; }
	}

	@media (max-width: 420px) {
		.werkzeuge { align-items: stretch; }
		.knopf { width: 100%; justify-content: center; }
		.meta { align-items: flex-start; flex-direction: column; gap: .4rem; }
	}
</style>
