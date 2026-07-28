<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { VertretungErgebnis } from '$lib/server/daten';

	let {
		ergebnis,
		/** Ändert sich mit jeder Seite — Auslöser für die Neumessung. */
		schluessel,
		children
	}: { ergebnis: VertretungErgebnis; schluessel: string; children: Snippet } = $props();

	let inhalt = $state<HTMLDivElement>();
	let ueberlauf = $state(false);

	const stand = $derived(ergebnis.stand);
	const prozent = $derived(
		stand.erwartet > 0 ? Math.round((stand.eingegangen / stand.erwartet) * 100) : 0
	);

	const MIN_SKALA = 0.5;
	/** Kleine Vertretungen (7 Sitze) sollen die Leinwand füllen, nicht kleben. */
	const MAX_SKALA = 2.2;
	const SCHRITT = 0.04;

	/**
	 * Verkleinert den Inhalt schrittweise, bis er in die Seite passt.
	 *
	 * Bewusst gemessen statt geraten: die Vertretungen reichen von 7 bis 58
	 * Sitzen, und die Auflösung des Beamers ist unbekannt. Feste Größenstufen
	 * haben genau den Überlauf erzeugt, der hier behoben wird.
	 */
	/** Beide Richtungen prüfen: seitlicher Überlauf versteckt Inhalt genauso. */
	const passtNicht = (el: HTMLElement) =>
		el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1;

	function messen() {
		const el = inhalt;
		if (!el) return;
		const setz = (v: number) => el.style.setProperty('--skala', String(v));

		let s = 1;
		setz(s);

		if (passtNicht(el)) {
			// Zu groß: verkleinern, bis es passt.
			while (passtNicht(el) && s > MIN_SKALA) {
				s = Math.max(MIN_SKALA, s - SCHRITT);
				setz(s);
			}
		} else {
			// Platz übrig: vergrößern, solange es noch passt.
			while (s < MAX_SKALA) {
				const naechste = Math.min(MAX_SKALA, s + SCHRITT);
				setz(naechste);
				if (passtNicht(el)) {
					setz(s);
					break;
				}
				s = naechste;
			}
		}

		// Passt es selbst bei kleinster Stufe nicht, darf gescrollt werden —
		// dann aber sichtbar, damit niemand denkt, er sähe alles.
		ueberlauf = passtNicht(el);
	}

	$effect(() => {
		schluessel; // bei jedem Seitenwechsel neu messen
		ergebnis;
		if (!inhalt) return;
		// Zwei Frames warten, damit Schriften und Diagramm gesetzt sind.
		const id = requestAnimationFrame(() => requestAnimationFrame(messen));
		const beobachter = new ResizeObserver(messen);
		beobachter.observe(inhalt);
		return () => {
			cancelAnimationFrame(id);
			beobachter.disconnect();
		};
	});
</script>

<section class="buehne">
	<header>
		<div class="titel">
			<h1>{ergebnis.ref.titel}</h1>
			<p>{ergebnis.ref.behoerde}</p>
		</div>
		<div class="stand">
			<strong class="zahl">{stand.eingegangen} von {stand.erwartet}</strong>
			<span>Schnellmeldungen · <span class="zahl">{prozent} %</span></span>
			<div class="balken" role="img" aria-label="{prozent} Prozent ausgezählt">
				<div style:width="{prozent}%" class:fertig={stand.vollstaendig}></div>
			</div>
		</div>
	</header>

	{#if ergebnis.stale}
		<p class="warnung">
			votemanager nicht erreichbar — letzter Stand von
			{new Date(ergebnis.zeitpunkt).toLocaleTimeString('de-DE')}
		</p>
	{:else if !stand.vollstaendig && stand.erwartet > 0}
		<p class="zwischenstand">Zwischenstand — kann sich mit jeder Schnellmeldung ändern</p>
	{/if}

	<div class="inhalt" class:ueberlauf bind:this={inhalt}>
		{@render children()}
	</div>

	{#if ueberlauf}
		<p class="warnung">Nicht alles passt auf die Seite — der Bereich ist scrollbar.</p>
	{/if}
</section>

<style>
	.buehne {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		padding: 1.4rem 2rem 1rem;
		gap: 0.6rem;
		overflow: hidden;
		background: var(--flaeche);
		color: var(--text);
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 2rem;
		flex: none;
	}

	h1 {
		font-size: clamp(1.6rem, 2.6vw, 2.6rem);
		line-height: 1.1;
	}

	.titel p {
		margin: 0.2rem 0 0;
		color: var(--text-2);
		font-size: clamp(0.9rem, 1.2vw, 1.25rem);
	}

	.stand {
		text-align: right;
		color: var(--text-2);
		font-size: clamp(0.8rem, 1vw, 1.05rem);
		min-width: 15rem;
		flex: none;
	}

	.stand strong {
		display: block;
		color: var(--text);
		font-size: clamp(1.2rem, 1.9vw, 1.9rem);
		line-height: 1.15;
	}

	.balken {
		height: 8px;
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: 99px;
		overflow: hidden;
		margin-top: 0.35rem;
	}

	.balken div {
		height: 100%;
		background: var(--akzent);
		transition: width 0.4s ease;
	}

	.balken div.fertig {
		background: var(--gut);
	}

	.zwischenstand {
		margin: 0;
		color: var(--text-3);
		font-size: 0.95rem;
		flex: none;
	}

	.warnung {
		margin: 0;
		color: var(--warn);
		background: var(--warn-flaeche);
		border-radius: var(--radius);
		padding: 0.35rem 0.8rem;
		font-size: 0.95rem;
		flex: none;
	}

	/* Der gemessene Bereich: --skala steuert alle Größen der Seiteninhalte. */
	.inhalt {
		--skala: 1;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.inhalt.ueberlauf {
		overflow-y: auto;
	}
</style>
