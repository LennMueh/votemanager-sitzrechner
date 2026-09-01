<script lang="ts">
	import { goto } from '$app/navigation';
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

	/**
	 * Einstellungen stehen in der Adresse, wie schon `v=` und `wahltag=`: damit
	 * ist die Beamer-Ansicht als Ganzes teil- und neuladbar, und es braucht
	 * keinen zweiten Speicherort neben der URL.
	 */
	const TAKT_VORGABE = 15;
	const TAKT_MIN = 3;
	const TAKT_MAX = 120;
	const TAKT_STUFEN = [10, 15, 20, 30, 60];

	/** Taktzeit je Seite, aus `?takt=` in Sekunden. Unsinn fällt auf die Vorgabe zurück. */
	const takt = $derived(
		Math.min(TAKT_MAX, Math.max(TAKT_MIN, Number(page.url.searchParams.get('takt')) || TAKT_VORGABE))
	);
	const taktMs = $derived(takt * 1000);

	const SEITENARTEN = [
		{ wert: 'uebersicht', text: 'Sitzverteilung' },
		{ wert: 'stimmen', text: 'Stimmen' },
		{ wert: 'kacheln', text: 'Gewählte' }
	] as const;

	/** Welche Seitenarten laufen, aus `?seiten=`. Ohne Angabe gilt alles. */
	const gewuenschteSeiten = $derived.by(() => {
		const roh = (page.url.searchParams.get('seiten') ?? '')
			.split(',')
			.filter((x) => SEITENARTEN.some((a) => a.wert === x));
		return roh.length ? new Set(roh) : new Set(SEITENARTEN.map((a) => a.wert));
	});

	function einstellen(name: string, wert: string) {
		const parameter = new URLSearchParams(page.url.searchParams);
		if (wert) parameter.set(name, wert);
		else parameter.delete(name);
		// replaceState: sonst wandert die Zurück-Taste durch jede Takt-Einstellung.
		void goto(`?${parameter}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function seitenartUmschalten(wert: string) {
		const naechste = new Set(gewuenschteSeiten);
		if (naechste.has(wert)) naechste.delete(wert);
		else naechste.add(wert);
		// Keine leere Auswahl: sonst bliebe die Leinwand dunkel.
		if (!naechste.size) return;
		const alle = naechste.size === SEITENARTEN.length;
		einstellen('seiten', alle ? '' : SEITENARTEN.filter((a) => naechste.has(a.wert)).map((a) => a.wert).join(','));
	}

	let ergebnisse = $state<Record<string, VertretungErgebnis>>({});
	let neuJeSchluessel = $state<Record<string, string[]>>({});
	let wegJeSchluessel = $state<Record<string, { partei: string; name: string }[]>>({});
	let index = $state(0);
	let pausiert = $state(false);
	/** Zähler, der den Takt neu anwirft — siehe `vor()` und `weiter()`. */
	let taktAnker = $state(0);
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
	/**
	 * Als String abgeleitet, nicht als Array: ein Derived-Array ist nach jedem
	 * Datenabruf eine neue Referenz und risse die SSE-Verbindung jedes Mal ab und
	 * ohne Replay wieder auf. Dieselbe Falle wie in `+page.svelte` und `v/`.
	 */
	const stromSchluessel = $derived(
		auswahl
			.flatMap((k) => {
				if (/^i\d+:/.test(k)) return [`v:${k}`];
				const e = ergebnisse[k];
				return e?.ref.instanzId ? [`v:i${e.ref.instanzId}:${e.ref.wahlId}:${e.ref.gebietId}`] : [];
			})
			.sort()
			.join(',')
	);

	$effect(() => {
		if (auswahl.length) void ladeAlle();
	});

	$effect(() => {
		if (!stromSchluessel) return;
		return strom(stromSchluessel.split(','), () => void ladeAlle());
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
				const moeglich: { k: string; art: Art }[] = [
					{ k, art: 'uebersicht' as Art },
					{ k, art: 'stimmen' as Art },
					...(mitNamen ? [{ k, art: 'kacheln' as Art }] : [])
				];
				const gewaehlt = moeglich.filter((s) => gewuenschteSeiten.has(s.art));
				// Streicht der Filter für diese Vertretung alles weg, lieber die volle
				// Abfolge zeigen als sie stumm aus der Präsentation fallen zu lassen.
				return gewaehlt.length ? gewaehlt : moeglich;
			}
			if (e.stimmverhaeltnis) return [{ k, art: 'stimmen' }];
			return [{ k, art: 'laedt' }];
		})
	);

	/**
	 * Der Takt darf nicht an `seiten` hängen: das Derived ist nach jedem
	 * SSE-Update ein neues Array, der Effekt liefe neu und setzte den Interval
	 * vor Ablauf zurück — bei lebhafter Auszählung schaltete die Leinwand dann
	 * nie weiter, während der Fortschrittsbalken durchlief. Die Seitenzahl
	 * deshalb erst im Callback lesen; der läuft asynchron und wird nicht verfolgt.
	 */
	$effect(() => {
		if (pausiert) return;
		taktAnker;
		const t = setInterval(() => {
			if (seiten.length > 1) index = (index + 1) % seiten.length;
		}, taktMs);
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
		if (!seiten.length) return;
		index = (index - 1 + seiten.length) % seiten.length;
		// Takt neu anwerfen, sonst folgt die nächste Seite unvermittelt und der
		// Fortschrittsbalken zeigt eine Restzeit, die es nicht gibt.
		taktAnker++;
	}

	function weiter() {
		if (!seiten.length) return;
		index = (index + 1) % seiten.length;
		taktAnker++;
	}

	/**
	 * Bedieninstrumente gehören nicht dauerhaft auf eine Leinwand: nach kurzer
	 * Ruhe verschwinden Leiste und Mauszeiger, jede Regung holt sie zurück.
	 */
	const RUHE_MS = 3000;
	let ruht = $state(false);
	let uhr: ReturnType<typeof setTimeout>;
	const verborgen = $derived(ruht && !pausiert);

	function regung() {
		ruht = false;
		clearTimeout(uhr);
		uhr = setTimeout(() => (ruht = true), RUHE_MS);
	}

	$effect(() => {
		regung();
		return () => clearTimeout(uhr);
	});

	function taste(e: KeyboardEvent) {
		regung();
		if (seiten.length === 0) return;
		// Steht der Fokus in einem Bedienelement, gehören die Tasten diesem: sonst
		// blättert der Pfeil im Takt-Auswahlfeld die Präsentation weiter, und die
		// Leertaste löst gleichzeitig Knopf und Pause aus.
		const ziel = e.target as HTMLElement | null;
		const tag = ziel?.tagName ?? '';
		if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.key === ' ' && tag === 'BUTTON') return;
		if (e.key === 'ArrowRight') weiter();
		if (e.key === 'ArrowLeft') vor();
		if (e.key === ' ') {
			e.preventDefault();
			pausiert = !pausiert;
		}
		if (e.key.toLowerCase() === 'f') vollbild();
	}
</script>

<svelte:window onkeydown={taste} onpointermove={regung} />

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
	<div class="rahmen" class:ruht={verborgen}>
		<div class="leiste" class:weg={verborgen}>
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
			<label class="einstellung">
				<span>Takt</span>
				<select
					value={String(takt)}
					onchange={(e) => einstellen('takt', e.currentTarget.value)}
				>
					{#each TAKT_STUFEN as sekunden (sekunden)}
						<option value={String(sekunden)}>{sekunden} s</option>
					{/each}
					{#if !TAKT_STUFEN.some((x) => x === takt)}
						<option value={String(takt)}>{takt} s</option>
					{/if}
				</select>
			</label>

			<div class="einstellung" role="group" aria-label="Seiten im Umlauf">
				<span>Seiten</span>
				{#each SEITENARTEN as a (a.wert)}
					<button
						class="sekundaer"
						aria-pressed={gewuenschteSeiten.has(a.wert)}
						onclick={() => seitenartUmschalten(a.wert)}
					>
						{a.text}
					</button>
				{/each}
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
				<div class="takt"><span style:animation-duration="{taktMs}ms"></span></div>
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
		position: relative;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: var(--flaeche);
	}

	.rahmen.ruht {
		cursor: none;
	}

	/*
	 * Overlay statt Flex-Zeile: so bleibt die Höhe der Bühne beim Ein- und
	 * Ausblenden gleich. Sie misst ihren Inhalt und leitet daraus --skala ab —
	 * eine springende Höhe hieße Neuskalierung bei jeder Mausbewegung.
	 */
	.leiste {
		position: absolute;
		inset: 0 0 auto;
		z-index: 1;
		transition: opacity 0.4s;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1rem;
		padding: 0.55rem clamp(.75rem, 2.5vw, 2rem);
		border-bottom: 1px solid var(--rand);
		background: var(--flaeche);
		color: var(--text-3);
		font-size: 0.9rem;
		flex: none;
	}

	/* Nur unsichtbar, nie aus dem Baum: sonst fiele ein fokussierter Knopf unter
	   den Fingern weg. Fokus in der Leiste hält sie deshalb sichtbar. */
	.leiste.weg:not(:focus-within) {
		opacity: 0;
		pointer-events: none;
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

	.einstellung {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex: none;
	}

	.einstellung > span {
		color: var(--text-3);
		font-size: 0.8rem;
	}

	.einstellung select {
		font: inherit;
		font-size: 0.8rem;
		min-height: 44px;
		padding: 0.35rem 0.5rem;
		border: 1px solid var(--rand);
		border-radius: 99px;
		background: var(--flaeche-2);
		color: var(--text);
	}

	/* Aktive Seitenart wie beim Themenumschalter: Zustand über aria-pressed,
	   sichtbar über die Fläche — nicht nur über die Farbe. */
	.leiste button[aria-pressed='true'] {
		background: var(--akzent);
		color: var(--auf-akzent);
		border-color: var(--akzent);
		font-weight: 700;
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
		/* Auf flachen Beamern zählt jede Zeile Höhe: die Einstellungen stehen
		   ohnehin in der Adresse und lassen sich dort setzen. */
		.einstellung { display: none; }
	}
</style>
