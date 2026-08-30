<script lang="ts">
	import { alsText, monatsraster, naechsterWahltag, verschiebeMonat } from './kalender';
	import type { Wahltermin } from './server/daten';

	// Ein <select> mit 870 Terminen von 1993 bis 2027 ist keine Auswahl mehr.
	// Der Kalender zeigt stattdessen, wann überhaupt gewählt wurde.
	let {
		termine,
		wert,
		onwaehlen
	}: { termine: Wahltermin[]; wert: string; onwaehlen: (datum: string) => void } = $props();

	const id = $props.id();

	const anzahl = $derived(new Map(termine.map((t) => [t.datum, t.wahlen])));
	const tage = $derived(termine.map((t) => t.datum));

	// Startmonat: der gewählte Tag, sonst der jüngste bekannte Termin.
	const anker = $derived(wert || tage.at(-1) || '');
	let jahr = $state(0);
	let monat = $state(0);
	$effect(() => {
		if (!jahr && anker) {
			jahr = Number(anker.slice(0, 4));
			monat = Number(anker.slice(4, 6));
		}
	});

	const raster = $derived(jahr ? monatsraster(jahr, monat, anzahl) : []);
	const imMonat = $derived(raster.filter((t) => t.imMonat && t.wahlen > 0).length);
	const monatsname = $derived(
		jahr
			? new Date(Date.UTC(jahr, monat - 1, 1)).toLocaleDateString('de-DE', {
					month: 'long',
					year: 'numeric',
					timeZone: 'UTC'
				})
			: ''
	);
	const heute = new Date().toISOString().slice(0, 10).replaceAll('-', '');

	const vorheriger = $derived(naechsterWahltag(tage, raster[0]?.datum ?? '', -1));
	const naechster = $derived(naechsterWahltag(tage, raster.at(-1)?.datum ?? '', 1));

	function blaettern(um: number) {
		({ jahr, monat } = verschiebeMonat(jahr, monat, um));
	}

	function springen(datum: string | undefined) {
		if (!datum) return;
		jahr = Number(datum.slice(0, 4));
		monat = Number(datum.slice(4, 6));
	}

	function waehlen(datum: string) {
		onwaehlen(datum);
		document.getElementById(id)?.hidePopover();
	}

	/**
	 * Pfeiltasten wandern nur über Wahltage — bei 33 Jahren Archiv wäre das
	 * Durchtasten leerer Monate sonst unzumutbar. Bild auf/ab wechselt den Monat.
	 */
	function taste(e: KeyboardEvent) {
		const schritt = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
		if (schritt) {
			e.preventDefault();
			const raster = (e.currentTarget as HTMLElement).closest('.raster')!;
			const felder = [...raster.querySelectorAll<HTMLButtonElement>('button[data-tag]')];
			const i = felder.indexOf(document.activeElement as HTMLButtonElement);
			const ziel = felder[i + schritt];
			if (ziel) ziel.focus();
			else springen(naechsterWahltag(tage, felder.at(schritt > 0 ? -1 : 0)?.dataset.tag ?? '', schritt > 0 ? 1 : -1));
			return;
		}
		if (e.key === 'PageDown' || e.key === 'PageUp') {
			e.preventDefault();
			blaettern(e.key === 'PageDown' ? 1 : -1);
		}
	}
</script>

<button class="ausloeser" popovertarget={id} aria-label="Wahltermin wählen — derzeit {wert ? alsText(wert) : 'keiner'}">
	<span class="datum">{wert ? alsText(wert) : 'Wahltermin wählen'}</span>
	<span aria-hidden="true">▾</span>
</button>

<div {id} popover class="kalender">
	<div class="kopf">
		<button type="button" onclick={() => blaettern(-12)} aria-label="Ein Jahr zurück">«</button>
		<button type="button" onclick={() => blaettern(-1)} aria-label="Ein Monat zurück">‹</button>
		<strong aria-live="polite">{monatsname}</strong>
		<button type="button" onclick={() => blaettern(1)} aria-label="Ein Monat vor">›</button>
		<button type="button" onclick={() => blaettern(12)} aria-label="Ein Jahr vor">»</button>
	</div>

	<div class="wochentage" aria-hidden="true">
		{#each ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as t (t)}<span>{t}</span>{/each}
	</div>

	<!-- Kein role="grid": das verlangt Zeilen, Zellen und eigene Fokusverwaltung.
	     Die Pfeiltasten hängen an den Tagesknöpfen selbst — dort liegt der Fokus,
	     wenn sie gedrückt werden, und ein Container mit Tastaturbedienung ohne
	     eigene Rolle wäre für Hilfsmittel eine Sackgasse. -->
	<div class="raster" role="group" aria-label="Tage im {monatsname}">
		{#each raster as tag (tag.datum)}
			{#if tag.wahlen > 0}
				<button
					type="button"
					data-tag={tag.datum}
					class:fremd={!tag.imMonat}
					class:gewaehlt={tag.datum === wert}
					class:heute={tag.datum === heute}
					class="wahltag"
					aria-label="{alsText(tag.datum)} — {tag.wahlen} {tag.wahlen === 1 ? 'Wahl' : 'Wahlen'}"
					aria-current={tag.datum === wert ? 'date' : undefined}
					onclick={() => waehlen(tag.datum)}
					onkeydown={taste}
				>
					<span class="zahl">{tag.tag}</span>
					<span class="wahlen">{tag.wahlen}</span>
				</button>
			{:else}
				<span class="leer" class:fremd={!tag.imMonat} class:heute={tag.datum === heute}>{tag.tag}</span>
			{/if}
		{/each}
	</div>

	<p class="fuss">
		{#if imMonat === 0}
			In diesem Monat wurde nicht gewählt.
		{:else}
			{imMonat} {imMonat === 1 ? 'Wahltag' : 'Wahltage'} in diesem Monat.
		{/if}
	</p>

	<div class="sprung">
		<button type="button" onclick={() => springen(vorheriger)} disabled={!vorheriger}>
			← {vorheriger ? alsText(vorheriger) : 'kein früherer'}
		</button>
		<button type="button" onclick={() => springen(naechster)} disabled={!naechster}>
			{naechster ? alsText(naechster) : 'kein späterer'} →
		</button>
	</div>
</div>

<style>
	.ausloeser {
		anchor-name: --ausloeser;
		display: inline-flex;
		align-items: center;
		gap: .4rem;
		min-height: 44px;
		padding: .45rem .65rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius-klein);
		background: var(--flaeche);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.datum { font-variant-numeric: tabular-nums; }

	.kalender {
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		background: var(--flaeche);
		color: var(--text);
		box-shadow: var(--schatten);
		padding: .75rem;
		width: min(22rem, 94vw);
		/* Rückfall für Browser ohne Ankerpositionierung: mittig statt gar nicht. */
		margin: auto;
	}

	/* Unter dem Auslöser statt in der Bildschirmmitte. Ankerpositionierung ist
	   noch nicht überall da, deshalb als Aufwertung und nicht als Voraussetzung. */
	@supports (position-anchor: --ausloeser) {
		.kalender {
			position-anchor: --ausloeser;
			position-area: bottom span-right;
			margin: .35rem 0 0;
			position-try-fallbacks: flip-block, flip-inline;
		}
	}
	.kalender:not(:popover-open) { display: none; }

	.kopf {
		display: grid;
		grid-template-columns: auto auto 1fr auto auto;
		align-items: center;
		gap: .25rem;
		margin-bottom: .5rem;
	}
	.kopf strong { text-align: center; }
	.kopf button, .sprung button {
		min-width: 2.2rem;
		min-height: 2.2rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius-klein);
		background: var(--flaeche-2);
		color: var(--text);
		font: inherit;
		cursor: pointer;
	}
	.kopf button:hover, .sprung button:hover:not(:disabled) { background: var(--flaeche); }
	.sprung button:disabled { opacity: .45; cursor: default; }

	.wochentage, .raster {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: .15rem;
	}
	.wochentage { color: var(--text-3); font-size: .75rem; text-align: center; margin-bottom: .2rem; }

	.raster > * {
		display: grid;
		place-content: center;
		aspect-ratio: 1;
		border-radius: var(--radius-klein);
		font-variant-numeric: tabular-nums;
	}

	/* Tage ohne Wahl sind sichtbar inaktiv — und gar nicht erst anwählbar. */
	.leer { color: var(--text-3); opacity: .5; }
	.fremd { opacity: .35; }

	.wahltag {
		border: 1px solid var(--rand);
		background: color-mix(in srgb, var(--akzent) 14%, var(--flaeche-2));
		color: var(--text);
		font: inherit;
		cursor: pointer;
		line-height: 1.05;
	}
	.wahltag:hover { background: color-mix(in srgb, var(--akzent) 26%, var(--flaeche-2)); }
	.wahltag .wahlen { font-size: .62rem; color: var(--text-2); }
	.wahltag.gewaehlt { outline: 2px solid var(--akzent); outline-offset: 1px; font-weight: 700; }
	/* Heute zusätzlich über die Form, nicht nur über Farbe. */
	.heute { text-decoration: underline; text-underline-offset: 2px; }

	.fuss { margin: .55rem 0 .4rem; font-size: .8rem; color: var(--text-3); text-align: center; }
	.sprung { display: flex; gap: .3rem; }
	.sprung button { flex: 1; font-size: .8rem; padding: .35rem; }
</style>
