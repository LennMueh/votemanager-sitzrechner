<script lang="ts">
	import { page } from '$app/state';
	import { vorwahl, type KatalogEintrag } from './katalog';
	let { titel = 'Bundesweite Wahlauswahl' }: { titel?: string } = $props();

	let eintraege = $state<KatalogEintrag[]>([]);
	let suche = $state('');
	let land = $state('');
	let region = $state('');
	let behoerde = $state('');
	let termin = $state('');
	let wahlart = $state('');
	let gewaehlt = $state<string[]>([]);
	let laedt = $state(true);
	let fehler = $state('');
	let standard = $state('');

	$effect(() => {
		fetch('/api/katalog')
			.then(async (r) => {
				if (!r.ok) throw new Error(r.statusText);
				return r.json();
			})
			.then((x) => {
				eintraege = x.eintraege;
				standard = page.url.searchParams.get('wahltag') ?? x.wahltag;
				termin = standard ? `${standard.slice(0, 4)}-${standard.slice(4, 6)}-${standard.slice(6, 8)}` : '';
			})
			.catch((e) => (fehler = String(e)))
			.finally(() => (laedt = false));
	});
	const eindeutig = (werte: string[]) => [...new Set(werte)].sort((a, b) => a.localeCompare(b, 'de'));
	const amTermin = $derived(eintraege.filter((e) => !termin || e.datum === termin));
	const laender = $derived(eindeutig(amTermin.map((e) => e.land)));
	const regionen = $derived(eindeutig(amTermin.filter((e) => !land || e.land === land).map((e) => e.region)));
	const behoerden = $derived(eindeutig(amTermin.filter((e) => (!land || e.land === land) && (!region || e.region === region)).map((e) => e.ags)));
	const termine = $derived(eindeutig(eintraege.map((e) => e.datum)).reverse());
	const wahlarten = $derived(eindeutig(amTermin.filter((e) =>
		(!land || e.land === land) && (!region || e.region === region) && (!behoerde || e.ags === behoerde)).map((e) => e.wahlart)));
	$effect(() => { const neu = vorwahl(laender, land); if (neu !== land) { land = neu; region = ''; behoerde = ''; } });
	$effect(() => { const neu = vorwahl(regionen, region); if (neu !== region) { region = neu; behoerde = ''; } });
	$effect(() => { behoerde = vorwahl(behoerden, behoerde); });
	$effect(() => { if (wahlart && !wahlarten.includes(wahlart)) wahlart = ''; });
	const sichtbar = $derived(amTermin.filter((e) =>
		(!land || e.land === land) && (!region || e.region === region) && (!behoerde || e.ags === behoerde) &&
		(!wahlart || e.wahlart === wahlart) &&
		(!suche || `${e.behoerde} ${e.wahl} ${e.gebietId}`.toLowerCase().includes(suche.toLowerCase()))));
	const name = (art: 'region' | 'behoerde', wert: string) => eintraege.find((e) => e[art === 'region' ? 'region' : 'ags'] === wert)?.[art === 'region' ? 'regionName' : 'behoerde'] ?? wert;
	const key = (e: KatalogEintrag) => `i${e.instanzId}:${e.wahlId}:${e.gebietId}`;
	const alleSichtbar = $derived(sichtbar.length > 0 && sichtbar.every((e) => gewaehlt.includes(key(e))));
	const ziel = $derived.by(() => {
		const parameter = new URLSearchParams({ v: gewaehlt.join(',') });
		const wahltag = termin.replaceAll('-', '') || standard;
		if (wahltag) parameter.set('wahltag', wahltag);
		return `/praesentation?${parameter}`;
	});
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
		<select value={land} aria-label="Bundesland" onchange={(e) => { land = e.currentTarget.value; region = ''; behoerde = ''; }}>
			<option value="">Bundesland</option>{#each laender as x}<option>{x}</option>{/each}
		</select>
		<select value={region} aria-label="Landkreis oder Region" onchange={(e) => { region = e.currentTarget.value; behoerde = ''; }}>
			<option value="">Landkreis/Region</option>{#each regionen as x}<option value={x}>{name('region', x)}</option>{/each}
		</select>
		<select value={behoerde} aria-label="Behörde" onchange={(e) => (behoerde = e.currentTarget.value)}>
			<option value="">Behörde</option>{#each behoerden as x}<option value={x}>{name('behoerde', x)}</option>{/each}
		</select>
		<select bind:value={termin} aria-label="Wahltermin">
			<option value="">Wahltermin</option>{#each termine as x}<option>{x}</option>{/each}
		</select>
		<select bind:value={wahlart} aria-label="Wahlart">
			<option value="">Wahlart</option>{#each wahlarten as x}<option>{x}</option>{/each}
		</select>
	</div>
	<div class="aktionen">
		<button type="button" onclick={alleUmschalten} disabled={!sichtbar.length}>
			{alleSichtbar ? 'Alle Treffer abwählen' : 'Alle Treffer auswählen'} ({sichtbar.length})
		</button>
		{#if gewaehlt.length && !zuLang}<a class="start" href={ziel}>{gewaehlt.length} Wahl(en) präsentieren →</a>{/if}
		{#if gewaehlt.length}<span>{gewaehlt.length} ausgewählt</span>{/if}
	</div>
	{#if zuLang}<p class="hinweis">Die Auswahl ist für einen sicheren Link zu groß. Bitte die Filter weiter eingrenzen.</p>{/if}
	{#if fehler}
		<p class="hinweis" role="status">Wahlen konnten nicht geladen werden: {fehler}</p>
	{:else if laedt}
		<p class="status" role="status">Wahlen werden geladen …</p>
	{:else if !sichtbar.length}
		<p class="status" role="status">Keine Wahlen passen zu diesen Filtern.</p>
	{/if}
	<ul>
		{#each sichtbar.slice(0, 200) as e (key(e))}
			<li data-land={e.land}><label><input type="checkbox" checked={gewaehlt.includes(key(e))} onchange={(x) => waehlen(key(e), x.currentTarget.checked)} /> <strong>{e.wahl}</strong> → {e.gebiet} · {e.behoerde} · {e.datum}</label></li>
		{/each}
	</ul>
	{#if sichtbar.length > 200}<p class="status">Die ersten 200 von {sichtbar.length} Treffern werden angezeigt.</p>{/if}
</section>

<style>
	.katalog { margin: 1.5rem 0; padding: clamp(1rem, 2vw, 1.5rem); border: 1px solid var(--rand); border-radius: var(--radius); background: color-mix(in srgb, var(--flaeche) 88%, transparent); box-shadow: var(--schatten); }
	h2 { margin-bottom: 1rem; font-size: clamp(1.1rem, 2vw, 1.35rem); }
	.filter { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr)); gap: .65rem; }
	input:not([type='checkbox']), select { min-width: 0; min-height: 44px; padding: .65rem .75rem; border: 1px solid var(--rand); border-radius: var(--radius-klein); background: var(--flaeche); color: var(--text); }
	input[type='search'] { grid-column: 1 / -1; }
	.aktionen { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem; margin-top: 1rem; }
	button { min-height: 44px; padding: .55rem .85rem; border: 1px solid var(--rand); border-radius: var(--radius-klein); background: var(--flaeche-2); color: var(--text); cursor: pointer; }
	button:disabled { opacity: .5; cursor: default; }
	ul { max-height: 22rem; overflow: auto; padding: 0; margin-bottom: 0; list-style: none; scrollbar-gutter: stable; }
	li { border-bottom: 1px solid var(--rand); }
	label { display: block; padding: .65rem .25rem; cursor: pointer; }
	label input { width: 1rem; height: 1rem; margin-right: .35rem; accent-color: var(--akzent); }
	.start { display: inline-flex; align-items: center; min-height: 44px; padding: .55rem .9rem; border-radius: var(--radius-klein); background: var(--akzent); color: var(--auf-akzent); font-weight: 700; text-decoration: none; }
	.status { color: var(--text-2); }
	@media (max-width: 520px) { .aktionen > * { width: 100%; } .aktionen span { width: auto; } }
</style>
