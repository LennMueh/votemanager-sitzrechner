<script lang="ts">
	import Zurueck from '$lib/stil/Zurueck.svelte';
	import { page } from '$app/state';
	import VertretungAnsicht from '$lib/VertretungAnsicht.svelte';
	import { strom } from '$lib/strom';
	import type { VertretungErgebnis } from '$lib/server/daten';

	const abfrage = $derived(page.url.searchParams.toString());
	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');

	let ergebnis = $state<VertretungErgebnis | undefined>();
	let fehler = $state('');
	let laedt = $state(true);
	const stromSchluessel = $derived(ergebnis?.ref.instanzId
		? `v:i${ergebnis.ref.instanzId}:${ergebnis.ref.wahlId}:${ergebnis.ref.gebietId}`
		: '');

	/** `still` für die Nachführung per SSE: die soll die Seite nicht abblenden. */
	async function laden(still = false) {
		if (!still) laedt = true;
		try {
			// Der Header hält die Nachführung aus der Aufrufzählung heraus.
			const a = await fetch(
				`/api/vertretung?${abfrage}`,
				still ? { headers: { 'x-aktualisierung': '1' } } : undefined
			);
			const j = await a.json();
			if (!a.ok) throw new Error(j.fehler ?? a.statusText);
			ergebnis = j;
			fehler = '';
		} catch (e) {
			fehler = String(e);
		} finally {
			laedt = false;
		}
	}

	$effect(() => {
		abfrage; // bei geänderter Vertretung neu laden
		void laden();
	});

	$effect(() => {
		if (!stromSchluessel) return;
		return strom([stromSchluessel], () => void laden(true));
	});
</script>

<main aria-busy={laedt}>
	<!-- Zurück in die Liste der eigenen Behörde, nicht bis zu den Bundesländern:
	     die Startseite schlägt Land und Region über die AGS nach. -->
	<Zurueck href={ergebnis
		? `/?ansicht=wahlen&behoerde=${ergebnis.ref.ags}${wahltag ? `&wahltag=${wahltag}` : ''}`
		: `/${wahltag ? `?wahltag=${wahltag}` : ''}`}>← {ergebnis?.ref.behoerde ?? 'Alle Vertretungen'}</Zurueck>

	{#if fehler}
		<p class="hinweis">{fehler}</p>
	{:else if ergebnis}
		<VertretungAnsicht {ergebnis} />

		{#if ergebnis.amtlich}
			<p class="amtlich">
				Für diesen Wahltermin hat votemanager bereits das amtliche Endergebnis mit
				{ergebnis.amtlich.anzahl} Sitzen veröffentlicht — die hier gezeigte Berechnung stimmt
				damit überein (siehe Tests).
			</p>
		{/if}
	{:else}
		<p class="laedt">Lade …</p>
	{/if}
</main>

<style>
	main {
		max-width: 980px;
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem) 4rem;
	}

	.amtlich {
		margin-top: 1.5rem;
		font-size: var(--schrift-s);
		color: var(--text-2);
		border-left: 3px solid var(--rand);
		padding-left: 0.8rem;
	}

	.laedt {
		color: var(--text-2);
	}

	/* Beim Wechsel bleibt das alte Ergebnis stehen, bis das neue da ist —
	   abblenden statt leerräumen, Leerräumen erzeugt nur ein Blinken. */
	main[aria-busy='true'] {
		opacity: 0.55;
		transition: opacity 0.15s ease;
	}
</style>
