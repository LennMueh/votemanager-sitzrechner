<script lang="ts">
	import { page } from '$app/state';
	import type { VertretungErgebnis } from '$lib/server/daten';
	let daten = $state<{ aktuell: VertretungErgebnis; vergleich: VertretungErgebnis; aktuellJahr: string; vergleichJahr: string }>();
	let fehler = $state('');
	$effect(() => { fetch(`/api/vergleich?${page.url.searchParams}`).then(async (r) => { const x = await r.json(); if (!r.ok) throw new Error(x.fehler); daten = x; }).catch((e) => (fehler = String(e))); });
	const sitze = (x: VertretungErgebnis) => x.verteilung?.parteien.filter((p) => p.sitze > 0) ?? [];
</script>

<main>
	<a class="zurueck" href="/">← Übersicht</a>
	{#if fehler}<p class="hinweis">{fehler}</p>{:else if !daten}<p class="laedt">Vergleich wird geladen …</p>{:else}
		<h1>{daten.aktuell.ref.titel}</h1>
		<div class="vergleich">
			{#each [[daten.aktuell, daten.aktuellJahr], [daten.vergleich, daten.vergleichJahr]] as [x, jahr]}
				<section><h2>{jahr}</h2><p>{x.stand.text}</p>
					{#if x.verteilung}<table><thead><tr><th>Partei/Liste</th><th>Sitze</th></tr></thead><tbody>{#each sitze(x) as p}<tr><td>{p.partei}</td><td>{p.sitze}</td></tr>{/each}</tbody></table>{:else}<p class="hinweis">Keine Sitzverteilung verfügbar.</p>{/if}
					{#if x.amtlich}<p>Gewählte Personen: {x.amtlich.gewaehlte.flat().join(', ') || 'noch nicht veröffentlicht'}</p>{/if}
				</section>
			{/each}
		</div>
	{/if}
</main>

<style>
	main { max-width: var(--inhalt); margin: 0 auto; padding: clamp(1rem, 4vw, 3rem) 1rem 4rem; }
	.zurueck { display: inline-flex; min-height: 44px; align-items: center; }
	.vergleich { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
	section { padding: 1rem; border: 1px solid var(--rand); border-radius: var(--radius); background: var(--flaeche); }
	table { width: 100%; border-collapse: collapse; } th, td { padding: .5rem; border-bottom: 1px solid var(--rand); text-align: left; } th:last-child, td:last-child { text-align: right; }
	@media (max-width: 640px) { .vergleich { grid-template-columns: 1fr; } }
</style>
