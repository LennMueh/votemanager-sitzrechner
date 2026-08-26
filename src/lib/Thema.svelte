<script lang="ts">
	/**
	 * Umschalter System / Hell / Dunkel.
	 *
	 * Gesetzt wird nur `data-theme` am <html>-Element; die Farben selbst kommen
	 * aus `light-dark()` in +layout.svelte. Die Vorbelegung passiert schon im
	 * Inline-Skript in app.html, damit nichts aufblitzt.
	 */
	type Thema = 'system' | 'hell' | 'dunkel';

	let aktuell = $state<Thema>('system');

	$effect(() => {
		const gespeichert = localStorage.getItem('thema');
		if (gespeichert === 'hell' || gespeichert === 'dunkel') aktuell = gespeichert;
	});

	function waehle(t: Thema) {
		aktuell = t;
		if (t === 'system') {
			delete document.documentElement.dataset.theme;
			localStorage.removeItem('thema');
		} else {
			document.documentElement.dataset.theme = t;
			localStorage.setItem('thema', t);
		}
	}

	const knoepfe: { wert: Thema; text: string; titel: string }[] = [
		{ wert: 'system', text: 'Auto', titel: 'Systemeinstellung folgen' },
		{ wert: 'hell', text: 'Hell', titel: 'Immer helles Thema' },
		{ wert: 'dunkel', text: 'Dunkel', titel: 'Immer dunkles Thema' }
	];
</script>

<div class="thema" role="group" aria-label="Farbthema">
	{#each knoepfe as k (k.wert)}
		<button
			type="button"
			title={k.titel}
			aria-pressed={aktuell === k.wert}
			onclick={() => waehle(k.wert)}
		>
			{k.text}
		</button>
	{/each}
</div>

<style>
	.thema {
		display: inline-flex;
		border: 1px solid var(--rand);
		border-radius: 99px;
		overflow: hidden;
		flex: none;
	}

	button {
		font: inherit;
		font-size: 0.8rem;
		min-height: 44px;
		padding: 0.45rem 0.75rem;
		border: 0;
		background: var(--flaeche);
		color: var(--text-2);
		cursor: pointer;
		line-height: 1.4;
	}

	button + button {
		border-left: 1px solid var(--rand);
	}

	button[aria-pressed='true'] {
		background: var(--akzent);
		color: var(--auf-akzent);
		font-weight: 600;
	}
</style>
