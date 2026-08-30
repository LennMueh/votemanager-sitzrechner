<script lang="ts">
	import { page } from '$app/state';
	import Thema from '$lib/Thema.svelte';
	import WahlAuswahl from '$lib/WahlAuswahl.svelte';
	import Stimmverhaeltnis from '$lib/Stimmverhaeltnis.svelte';
	import Buehne from '$lib/praesentation/Buehne.svelte';
	import SeiteUebersicht from '$lib/praesentation/SeiteUebersicht.svelte';
	import SeiteKacheln from '$lib/praesentation/SeiteKacheln.svelte';
	import SeiteDirektwahl from '$lib/praesentation/SeiteDirektwahl.svelte';
	import { strom } from '$lib/strom';
	import { vertretungPfad } from '$lib/auswahl';
	import type { VertretungErgebnis } from '$lib/server/daten';

	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');
	/** Auswahl steht in der URL — damit ist die Beamer-Ansicht teil- und neuladbar. */
	const auswahl = $derived((page.url.searchParams.get('v') ?? '').split(',').filter(Boolean));

	/** Taktzeit je Seite. */
	const TAKT_MS = 15_000;

	let ergebnisse = $state<Record<string, VertretungErgebnis>>({});
	let neuJeSchluessel = $state<Record<string, string[]>>({});
	let wegJeSchluessel = $state<Record<string, { partei: string; name: string }[]>>({});
	let index = $state(0);
	let pausiert = $state(false);
	let fehler = $state('');

	// Letzter bekannter Stand der Gewählten je Vertretung, für die Hervorhebung.
	const vorher = new Map<string, Set<string>>();

	async function ladeEine(k: string) {
		try {
			const a = await fetch(vertretungPfad(k, wahltag));
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
	const stromSchluessel = $derived(auswahl.flatMap((k) => {
		if (/^i\d+:/.test(k)) return [`v:${k}`];
		const e = ergebnisse[k];
		return e?.ref.instanzId ? [`v:i${e.ref.instanzId}:${e.ref.wahlId}:${e.ref.gebietId}`] : [];
	}));

	$effect(() => {
		if (auswahl.length) void ladeAlle();
	});

	$effect(() => {
		if (!stromSchluessel.length) return;
		return strom(stromSchluessel, () => void ladeAlle());
	});

	/**
	 * Eine Ratswahl belegt Parlament, Stimmen und Gewählte; eine Auswahl ohne
	 * Sitzverteilung nur die Stimmen. Geblättert wird seitenweise.
	 */
	type Art = 'uebersicht' | 'stimmen' | 'kacheln' | 'direkt' | 'laedt';
	const seiten = $derived(
		auswahl.flatMap((k): { k: string; art: Art }[] => {
			const e = ergebnisse[k];
			if (!e) return [{ k, art: 'laedt' }];
			if (e.direkt) return [{ k, art: 'direkt' }];
			if (e.verteilung) {
				// Die Kachelseite zeigt die Gewählten namentlich. Nennt der Feed keine
				// Namen (Saarland: reine Listenwahl, § 41 KWG SL), bliebe sie leer —
				// dann lieber überspringen als eine leere Seite auf die Leinwand takten.
				const mitNamen = e.verteilung.sitze.some((s) => s.name || s.unbesetzt);
				return [
					{ k, art: 'uebersicht' as Art },
					{ k, art: 'stimmen' as Art },
					...(mitNamen ? [{ k, art: 'kacheln' as Art }] : [])
				];
			}
			if (e.stimmverhaeltnis) return [{ k, art: 'stimmen' }];
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

	$effect(() => {
		if (seiten.length && index >= seiten.length) index = 0;
	});

	function vollbild() {
		const wechsel = document.fullscreenElement
			? document.exitFullscreen()
			: document.documentElement.requestFullscreen();
		void wechsel.catch(() => {});
	}

	function vor() {
		if (seiten.length) index = (index - 1 + seiten.length) % seiten.length;
	}

	function weiter() {
		if (seiten.length) index = (index + 1) % seiten.length;
	}

	function taste(e: KeyboardEvent) {
		if (seiten.length === 0) return;
		if (e.key === 'ArrowRight') weiter();
		if (e.key === 'ArrowLeft') vor();
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

		<WahlAuswahl titel="Wahlen für die Präsentation auswählen" />
		<a href="/{wahltag ? `?wahltag=${wahltag}` : ''}">← Übersicht</a>
	</main>
{:else}
	<!-- Beamer-Ansicht -->
	<div class="rahmen">
		<div class="leiste">
			<span class="zaehler zahl">{index + 1} / {seiten.length}</span>
			<span class="tasten" aria-hidden="true">
				Leertaste: {pausiert ? 'weiter' : 'Pause'} · ← → blättern · F Vollbild
			</span>
			<div class="steuerung" role="group" aria-label="Präsentation steuern">
				<button class="sekundaer icon" onclick={vor} aria-label="Vorherige Seite">←</button>
				<button class="sekundaer pause" onclick={() => (pausiert = !pausiert)}>
					{pausiert ? 'Weiter' : 'Pause'}
				</button>
				<button class="sekundaer icon" onclick={weiter} aria-label="Nächste Seite">→</button>
			</div>
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
					{:else if aktuell.art === 'stimmen' && gezeigt.stimmverhaeltnis}
						<Stimmverhaeltnis verhaeltnis={gezeigt.stimmverhaeltnis} verteilung={gezeigt.verteilung} gross />
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

	button {
		font: inherit;
		min-height: 44px;
		padding: 0.5rem 0.9rem;
		border-radius: var(--radius);
		border: 1px solid var(--akzent);
		background: var(--akzent);
		color: var(--auf-akzent);
		cursor: pointer;
	}

	button.sekundaer {
		background: var(--flaeche-2);
		color: var(--text);
		border-color: var(--rand);
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
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 0.55rem clamp(.75rem, 2.5vw, 2rem);
		border-bottom: 1px solid var(--rand);
		background: color-mix(in srgb, var(--flaeche) 90%, transparent);
		color: var(--text-3);
		font-size: 0.9rem;
		flex: none;
	}

	.tasten {
		margin-right: auto;
	}

	.steuerung { display: flex; gap: .35rem; margin-left: auto; }

	.leiste button {
		padding: 0.35rem 0.7rem;
		font-size: 0.8rem;
		border-radius: 99px;
	}

	.leiste button.icon { width: 44px; padding-inline: 0; font-size: 1.1rem; }

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

	@media (max-width: 760px) {
		.auswahl { padding-top: 1.25rem; }
		.kopf { align-items: flex-start; flex-direction: column; }
		.leiste { gap: .45rem; }
		.tasten { display: none; }
		.zaehler { margin-right: auto; font-weight: 700; }
		.steuerung { order: 3; width: 100%; margin: 0; }
		.steuerung .pause { flex: 1; }
		.hinweis { margin: .5rem .75rem 0; }
	}

	@media (max-height: 560px) {
		.leiste { padding-block: .3rem; }
		.leiste :global(.thema) { display: none; }
	}
</style>
