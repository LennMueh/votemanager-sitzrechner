<script lang="ts">
	import { page } from '$app/state';
	import Thema from '$lib/Thema.svelte';
	import Buehne from '$lib/praesentation/Buehne.svelte';
	import SeiteUebersicht from '$lib/praesentation/SeiteUebersicht.svelte';
	import SeiteKacheln from '$lib/praesentation/SeiteKacheln.svelte';
	import SeiteDirektwahl from '$lib/praesentation/SeiteDirektwahl.svelte';
	import type { Uebersicht, UebersichtEintrag, VertretungErgebnis } from '$lib/server/daten';

	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');
	const zusatz = $derived(wahltag ? `&wahltag=${wahltag}` : '');
	/** Auswahl steht in der URL — damit ist die Beamer-Ansicht teil- und neuladbar. */
	const auswahl = $derived((page.url.searchParams.get('v') ?? '').split(',').filter(Boolean));

	/** Taktzeit **je Seite**; eine Ratswahl hat zwei Seiten und steht damit 30 s. */
	const TAKT_MS = 15_000;
	const AKTUALISIERUNG_MS = 30_000;

	let uebersicht = $state<Uebersicht | undefined>();
	let markiert = $state<string[]>([]);
	let ergebnisse = $state<Record<string, VertretungErgebnis>>({});
	let neuJeSchluessel = $state<Record<string, string[]>>({});
	let wegJeSchluessel = $state<Record<string, { partei: string; name: string }[]>>({});
	let index = $state(0);
	let pausiert = $state(false);
	let fehler = $state('');

	// Letzter bekannter Stand der Gewählten je Vertretung, für die Hervorhebung.
	const vorher = new Map<string, Set<string>>();

	const schluessel = (e: UebersichtEintrag) => `${e.ags}:${e.wahlId}:${e.gebietId}`;

	async function ladeUebersicht() {
		const a = await fetch(`/api/uebersicht${wahltag ? `?wahltag=${wahltag}` : ''}`);
		uebersicht = await a.json();
	}

	async function ladeEine(k: string) {
		const [ags, wahl, gebiet] = k.split(':');
		try {
			const a = await fetch(`/api/vertretung?ags=${ags}&wahl=${wahl}&gebiet=${gebiet}${zusatz}`);
			const j: VertretungErgebnis = await a.json();
			if (!a.ok) throw new Error((j as unknown as { fehler: string }).fehler);

			const jetzt = new Set(
				(j.verteilung?.sitze ?? []).filter((s) => s.name).map((s) => `${s.partei}|${s.name}`)
			);
			const alt = vorher.get(k);
			if (alt) {
				const neu = [...jetzt].filter((x) => !alt.has(x));
				const weg = [...alt]
					.filter((x) => !jetzt.has(x))
					.map((x) => {
						const [partei, name] = x.split('|');
						return { partei, name };
					});
				// Nur überschreiben, wenn sich wirklich etwas geändert hat — sonst
				// verschwindet die Hervorhebung beim nächsten Abruf sofort wieder.
				if (neu.length || weg.length) {
					neuJeSchluessel[k] = neu;
					wegJeSchluessel[k] = weg;
				}
			}
			vorher.set(k, jetzt);
			ergebnisse[k] = j;
			fehler = '';
		} catch (e) {
			fehler = String(e);
		}
	}

	const ladeAlle = () => Promise.all(auswahl.map(ladeEine));

	$effect(() => {
		if (auswahl.length === 0) {
			ladeUebersicht();
			return;
		}
		ladeAlle();
		const t = setInterval(ladeAlle, AKTUALISIERUNG_MS);
		return () => clearInterval(t);
	});

	/**
	 * Eine Ratswahl belegt zwei Seiten (Übersicht, dann Kacheln), eine
	 * Direktwahl eine. Geblättert wird seitenweise.
	 */
	type Art = 'uebersicht' | 'kacheln' | 'direkt' | 'laedt';
	const seiten = $derived(
		auswahl.flatMap((k): { k: string; art: Art }[] => {
			const e = ergebnisse[k];
			if (!e) return [{ k, art: 'laedt' }];
			if (e.direkt) return [{ k, art: 'direkt' }];
			if (e.verteilung) {
				return [
					{ k, art: 'uebersicht' },
					{ k, art: 'kacheln' }
				];
			}
			return [{ k, art: 'laedt' }];
		})
	);

	$effect(() => {
		if (seiten.length < 2 || pausiert) return;
		const t = setInterval(() => {
			index = (index + 1) % seiten.length;
		}, TAKT_MS);
		return () => clearInterval(t);
	});

	const aktuell = $derived(seiten[index % Math.max(1, seiten.length)]);
	const gezeigt = $derived(aktuell ? ergebnisse[aktuell.k] : undefined);

	function starten() {
		const u = new URL(page.url);
		u.searchParams.set('v', markiert.join(','));
		location.href = u.toString();
	}

	function vollbild() {
		if (document.fullscreenElement) document.exitFullscreen();
		else document.documentElement.requestFullscreen();
	}

	function taste(e: KeyboardEvent) {
		if (seiten.length === 0) return;
		if (e.key === 'ArrowRight') index = (index + 1) % seiten.length;
		if (e.key === 'ArrowLeft') index = (index - 1 + seiten.length) % seiten.length;
		if (e.key === ' ') {
			e.preventDefault();
			pausiert = !pausiert;
		}
		if (e.key.toLowerCase() === 'f') vollbild();
	}
</script>

<svelte:window onkeydown={taste} />

{#if auswahl.length === 0}
	<!-- Auswahlbildschirm -->
	<main class="auswahl">
		<div class="kopf">
			<h1>Präsentationsmodus</h1>
			<Thema />
		</div>
		<p class="unter">
			Vertretungen auswählen, die auf der Leinwand durchlaufen sollen. Die Auswahl steht danach
			in der Adresse und lässt sich als Lesezeichen speichern.
		</p>

		{#if !uebersicht}
			<p>Lade …</p>
		{:else}
			<div class="knoepfe">
				<button onclick={starten} disabled={markiert.length === 0}>
					Präsentation starten ({markiert.length})
				</button>
				<button
					class="sekundaer"
					onclick={() =>
						(markiert = (uebersicht?.eintraege ?? [])
							.filter((e) => !e.direktwahl && e.sitze)
							.map(schluessel))}
				>
					Alle Räte
				</button>
				<button class="sekundaer" onclick={() => (markiert = [])}>Auswahl leeren</button>
				<a href="/{wahltag ? `?wahltag=${wahltag}` : ''}">← Übersicht</a>
			</div>

			<ul>
				{#each uebersicht.eintraege as e (schluessel(e))}
					<li>
						<label>
							<input type="checkbox" value={schluessel(e)} bind:group={markiert} />
							<span>{e.titel}</span>
							<span class="behoerde">{e.behoerde}</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}
	</main>
{:else}
	<!-- Beamer-Ansicht -->
	<div class="rahmen">
		<div class="leiste">
			<span class="zaehler zahl">{index + 1} / {seiten.length}</span>
			<span class="tasten">
				Leertaste: {pausiert ? 'weiter' : 'Pause'} · ← → blättern · F Vollbild
			</span>
			<Thema />
			<button class="sekundaer" onclick={vollbild}>Vollbild</button>
		</div>

		{#if fehler}
			<p class="hinweis">{fehler}</p>
		{/if}

		{#if gezeigt && aktuell}
			{#key `${aktuell.k}:${aktuell.art}`}
				<Buehne ergebnis={gezeigt} schluessel="{aktuell.k}:{aktuell.art}">
					{#if aktuell.art === 'uebersicht' && gezeigt.verteilung}
						<SeiteUebersicht verteilung={gezeigt.verteilung} />
					{:else if aktuell.art === 'kacheln' && gezeigt.verteilung}
						<SeiteKacheln
							verteilung={gezeigt.verteilung}
							neu={new Set(neuJeSchluessel[aktuell.k] ?? [])}
							weg={wegJeSchluessel[aktuell.k] ?? []}
						/>
					{:else if aktuell.art === 'direkt' && gezeigt.direkt}
						<SeiteDirektwahl direkt={gezeigt.direkt} />
					{:else}
						<p class="laedt">{gezeigt.warnung ?? 'Keine Daten für diese Vertretung.'}</p>
					{/if}
				</Buehne>
			{/key}
		{:else}
			<p class="laedt">Lade …</p>
		{/if}

		{#if !pausiert && seiten.length > 1}
			{#key index}
				<div class="takt"><span style:animation-duration="{TAKT_MS}ms"></span></div>
			{/key}
		{/if}
	</div>
{/if}

<style>
	.auswahl {
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}

	.kopf {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.unter {
		color: var(--text-2);
	}

	.knoepfe {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
		margin: 1.25rem 0;
	}

	button {
		font: inherit;
		padding: 0.5rem 0.9rem;
		border-radius: var(--radius);
		border: 1px solid var(--akzent);
		background: var(--akzent);
		color: var(--flaeche);
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	button.sekundaer {
		background: var(--flaeche-2);
		color: var(--text);
		border-color: var(--rand);
	}

	.auswahl ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.25rem;
	}

	.auswahl label {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.45rem 0.7rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		cursor: pointer;
	}

	.behoerde {
		margin-left: auto;
		color: var(--text-3);
		font-size: 0.85rem;
	}

	/* Beamer */
	.rahmen {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--flaeche);
	}

	.leiste {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 2rem 0;
		color: var(--text-3);
		font-size: 0.9rem;
		flex: none;
	}

	.tasten {
		margin-right: auto;
	}

	.leiste button {
		padding: 0.3rem 0.7rem;
		font-size: 0.8rem;
		border-radius: 99px;
	}

	/* Die Bühne füllt den Rest; ihre eigene Höhe ist 100dvh, deshalb hier
	   zurücknehmen. */
	.rahmen :global(section) {
		flex: 1;
		min-height: 0;
		height: auto;
	}

	.takt {
		height: 4px;
		background: var(--flaeche-2);
		flex: none;
	}

	.takt span {
		display: block;
		height: 100%;
		background: var(--akzent);
		animation: fortschritt linear forwards;
	}

	@keyframes fortschritt {
		from {
			width: 0;
		}
		to {
			width: 100%;
		}
	}

	.laedt {
		color: var(--text-2);
		padding: 2rem;
	}

	.hinweis {
		margin: 0 2rem;
	}
</style>
