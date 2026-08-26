<script lang="ts">
	import type { KatalogEintrag } from './katalog';
	let { titel = 'Bundesweite Wahlauswahl' }: { titel?: string } = $props();

	let eintraege = $state<KatalogEintrag[]>([]);
	let suche = $state('');
	let land = $state('');
	let region = $state('');
	let behoerde = $state('');
	let termin = $state('');
	let wahlart = $state('');
	let gewaehlt = $state<string[]>([]);

	$effect(() => { fetch('/api/katalog').then((r) => r.ok ? r.json() : { eintraege: [] }).then((x) => eintraege = x.eintraege); });
	const eindeutig = (werte: string[]) => [...new Set(werte)].sort((a, b) => a.localeCompare(b, 'de'));
	const laender = $derived(eindeutig(eintraege.map((e) => e.land)));
	const regionen = $derived(eindeutig(eintraege.filter((e) => !land || e.land === land).map((e) => e.region)));
	const behoerden = $derived(eindeutig(eintraege.filter((e) => (!land || e.land === land) && (!region || e.region === region)).map((e) => e.ags)));
	const termine = $derived(eindeutig(eintraege.filter((e) => (!behoerde || e.ags === behoerde)).map((e) => e.datum)).reverse());
	const sichtbar = $derived(eintraege.filter((e) =>
		(!land || e.land === land) && (!region || e.region === region) && (!behoerde || e.ags === behoerde) &&
		(!termin || e.datum === termin) && (!wahlart || e.wahlart === wahlart) &&
		(!suche || `${e.behoerde} ${e.wahl} ${e.gebietId}`.toLowerCase().includes(suche.toLowerCase()))));
	const name = (art: 'region' | 'behoerde', wert: string) => eintraege.find((e) => e[art === 'region' ? 'region' : 'ags'] === wert)?.[art === 'region' ? 'regionName' : 'behoerde'] ?? wert;
	const key = (e: KatalogEintrag) => `i${e.instanzId}:${e.wahlId}:${e.gebietId}`;
	const alleSichtbar = $derived(sichtbar.length > 0 && sichtbar.every((e) => gewaehlt.includes(key(e))));
	const ziel = $derived(`/praesentation?v=${gewaehlt.join(',')}`);
	const zuLang = $derived(ziel.length > 7000);
	function waehlen(k: string, an: boolean) {
		gewaehlt = an ? [...new Set([...gewaehlt, k])] : gewaehlt.filter((x) => x !== k);
	}
	function alleUmschalten() {
		const treffer = new Set(sichtbar.map(key));
		gewaehlt = alleSichtbar
			? gewaehlt.filter((k) => !treffer.has(k))
			: [...new Set([...gewaehlt, ...treffer])];
	}
</script>

<section class="katalog">
	<h2>{titel}</h2>
	<div class="filter">
		<input type="search" bind:value={suche} placeholder="Behörde oder Wahl suchen …" aria-label="Wahlen suchen" />
		<select bind:value={land} aria-label="Bundesland"><option value="">Bundesland</option>{#each laender as x}<option>{x}</option>{/each}</select>
		<select bind:value={region} aria-label="Landkreis oder Region"><option value="">Landkreis/Region</option>{#each regionen as x}<option value={x}>{name('region', x)}</option>{/each}</select>
		<select bind:value={behoerde} aria-label="Behörde"><option value="">Behörde</option>{#each behoerden as x}<option value={x}>{name('behoerde', x)}</option>{/each}</select>
		<select bind:value={termin} aria-label="Wahltermin"><option value="">Wahltermin</option>{#each termine as x}<option>{x}</option>{/each}</select>
		<select bind:value={wahlart} aria-label="Wahlart"><option value="">Wahlart</option>{#each eindeutig(eintraege.map((e) => e.wahlart)) as x}<option>{x}</option>{/each}</select>
	</div>
	<div class="aktionen">
		<button type="button" onclick={alleUmschalten} disabled={!sichtbar.length}>
			{alleSichtbar ? 'Alle Treffer abwählen' : 'Alle Treffer auswählen'} ({sichtbar.length})
		</button>
		{#if gewaehlt.length && !zuLang}<a class="start" href={ziel}>{gewaehlt.length} Wahl(en) präsentieren →</a>{/if}
		{#if gewaehlt.length}<span>{gewaehlt.length} ausgewählt</span>{/if}
	</div>
	{#if zuLang}<p class="hinweis">Die Auswahl ist für einen sicheren Link zu groß. Bitte die Filter weiter eingrenzen.</p>{/if}
	<ul>
		{#each sichtbar.slice(0, 200) as e (key(e))}
			<li><label><input type="checkbox" checked={gewaehlt.includes(key(e))} onchange={(x) => waehlen(key(e), x.currentTarget.checked)} /> <strong>{e.wahl}</strong> → {e.gebiet} · {e.behoerde} · {e.datum}</label></li>
		{/each}
	</ul>
</section>

<style>
	.katalog { margin: 2rem 0; padding: 1rem; border: 1px solid var(--rand); border-radius: .6rem; }
	.filter { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: .5rem; }
	input, select { min-width: 0; padding: .55rem; }
	.aktionen { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin-top: 1rem; }
	button { font: inherit; padding: .5rem .8rem; border: 1px solid var(--rand); border-radius: var(--radius); background: var(--flaeche-2); color: var(--text); cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; }
	ul { max-height: 22rem; overflow: auto; padding: 0; list-style: none; }
	li { padding: .35rem 0; border-bottom: 1px solid var(--rand); }
	.start { font-weight: 700; }
</style>
