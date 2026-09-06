<script lang="ts">
	// Der Auszählstand als Balken. Zwei Dichten, weil die Übersicht ihn als
	// Zeile in einer Kachelreihe führt und dort nur eine Andeutung braucht.
	//
	// Abstand und Breite bleiben beim Aufrufer: wo der Balken steht, weiß nur
	// der, und der Präsentationsmodus setzt beides anders als die Seiten.
	// Ein <span> statt <div>, weil der Balken auf der Startseite in einem <a>
	// zwischen zwei Textzeilen sitzt.
	let {
		prozent,
		fertig = false,
		dichte = 'normal',
		beschriftung = `${prozent} Prozent ausgezählt`
	}: {
		prozent: number | string;
		fertig?: boolean;
		dichte?: 'normal' | 'kompakt';
		beschriftung?: string;
	} = $props();
</script>

<span class="balken" class:kompakt={dichte === 'kompakt'} role="img" aria-label={beschriftung}>
	<span style:width="{prozent}%" class:fertig></span>
</span>

<style>
	.balken {
		display: block;
		height: 7px;
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: var(--radius-pille);
		overflow: hidden;
		grid-column: var(--balken-spalte, auto);
		margin: var(--balken-abstand, 0.4rem 0 0.25rem);
		max-width: var(--balken-breite, none);
	}

	.balken.kompakt {
		height: 4px;
		border: 0;
		margin: var(--balken-abstand, 0);
	}

	.balken span {
		display: block;
		height: 100%;
		background: var(--akzent);
		transition: width 0.4s ease;
	}

	.balken span.fertig {
		background: var(--gut);
	}
</style>
