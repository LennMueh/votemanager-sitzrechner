<script lang="ts">
	import { page } from '$app/state';
	import { vergleichePersonen } from '$lib/vergleich';
	import type { VertretungErgebnis } from '$lib/server/daten';
	let daten = $state<{ aktuell: VertretungErgebnis; vergleich: VertretungErgebnis; aktuellWahltag: string; vergleichWahltag: string }>();
	let fehler = $state('');
	$effect(() => { fetch(`/api/vergleich?${page.url.searchParams}`).then(async (r) => { const x = await r.json(); if (!r.ok) throw new Error(x.fehler); daten = x; }).catch((e) => (fehler = String(e))); });
	const sitze = (x: VertretungErgebnis) => x.verteilung?.parteien.filter((p) => p.sitze > 0) ?? [];
	const personen = $derived(daten ? vergleichePersonen(daten.aktuell, daten.vergleich) : []);
	const datum = (tag: string) => `${tag.slice(6, 8)}.${tag.slice(4, 6)}.${tag.slice(0, 4)}`;
</script>

<main>
	<a class="zurueck" href={`/wahlen${page.url.searchParams.get('wahltag') ? `?wahltag=${page.url.searchParams.get('wahltag')}` : ''}`}>← Übersicht</a>
	{#if fehler}<p class="hinweis">{fehler}</p>{:else if !daten}<p class="laedt">Vergleich wird geladen …</p>{:else}
		<h1>{daten.aktuell.ref.titel}</h1>
		<div class="vergleich">
			{#each [[daten.aktuell, daten.aktuellWahltag], [daten.vergleich, daten.vergleichWahltag]] as [x, tag]}
				<section><h2>{datum(tag)}</h2><p>{x.stand.text}</p>
					{#if x.verteilung}<table class="sitze"><thead><tr><th>Partei/Liste</th><th>Sitze</th></tr></thead><tbody>{#each sitze(x) as p}<tr><td>{p.partei}</td><td>{p.sitze}</td></tr>{/each}</tbody></table>{:else}<p class="hinweis">Keine Sitzverteilung verfügbar.</p>{/if}
				</section>
			{/each}
		</div>
		{#if personen.length}
			<section class="personen"><h2>Gewählte Personen nach Partei/Liste</h2>
				{#each personen as gruppe}<h3>{gruppe.liste}</h3><div class="tabellenrahmen"><table><thead><tr><th>{datum(daten.aktuellWahltag)}</th><th>{datum(daten.vergleichWahltag)}</th></tr></thead><tbody>
					{#each gruppe.zeilen as zeile}<tr>{#each [zeile.aktuell, zeile.vergleich] as person}<td>{person?.name ?? '—'}{#if person?.mandat}<small>{person.mandat}</small>{/if}</td>{/each}</tr>{/each}
				</tbody></table></div>{/each}
			</section>
		{/if}
	{/if}
</main>

<style>
	main { max-width: var(--inhalt); margin: 0 auto; padding: clamp(1rem, 4vw, 3rem) 1rem 4rem; }
	.zurueck { display: inline-flex; min-height: 44px; align-items: center; }
	.vergleich { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	section { padding: 1rem; border: 1px solid var(--rand); border-radius: var(--radius); background: var(--flaeche); }
	table { width: 100%; border-collapse: collapse; } th, td { padding: .5rem; border-bottom: 1px solid var(--rand); text-align: left; } .sitze th:last-child, .sitze td:last-child { text-align: right; }
	.personen { margin-top: 1rem; } .personen h3 { margin: 1.25rem 0 .25rem; } .personen table { table-layout: fixed; } .personen td { vertical-align: top; overflow-wrap: anywhere; } small { display: block; margin-top: .2rem; color: var(--text-2); } .tabellenrahmen { overflow-x: auto; }
	@media (max-width: 640px) { .vergleich { grid-template-columns: 1fr; } }
</style>
