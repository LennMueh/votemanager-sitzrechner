<script lang="ts">
	import type { Sitzverteilung, Stimmenverhaeltnis } from './nkwg';

	let {
		verhaeltnis,
		verteilung,
		gross = false
	}: {
		verhaeltnis: Stimmenverhaeltnis;
		verteilung?: Sitzverteilung;
		gross?: boolean;
	} = $props();

	const ersatzfarben = ['#3366cc', '#dc3912', '#ff9900', '#109618', '#990099', '#0099c6', '#dd4477', '#66aa00'];
	const sitze = $derived(new Map((verteilung?.parteien ?? []).map((p) => [p.partei, p.sitze])));
	const parteien = $derived(verhaeltnis.parteien.map((p, i) => ({ ...p, farbe: p.farbe ?? ersatzfarben[i % ersatzfarben.length] })));
	const torte = $derived.by(() => {
		if (!verhaeltnis.stimmenGesamt) return 'var(--flaeche-2)';
		let von = 0;
		return `conic-gradient(${parteien.filter((p) => p.prozent > 0).map((p) => {
			const bis = von + p.prozent;
			const segment = `${p.farbe} ${von}% ${bis}%`;
			von = bis;
			return segment;
		}).join(', ')})`;
	});
	const fmt = new Intl.NumberFormat('de-DE');
	const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<div class="verhaeltnis" class:gross>
	<div
		class="torte"
		style:background={torte}
		role="img"
		aria-label="Stimmenanteile von {parteien.map((p) => `${p.partei} ${pct.format(p.prozent)} Prozent`).join(', ')}"
	><span></span></div>
	<ul>
		{#each parteien as p (p.partei)}
			{@const anzahlSitze = sitze.get(p.partei)}
			<li class:ohne-sitz={anzahlSitze === 0}>
				<span class="punkt" style:background={p.farbe}></span>
				<span class="name">{p.parteiLang ?? p.partei}</span>
				<strong class="zahl">{pct.format(p.prozent)} %</strong>
				<span class="stimmen zahl">{fmt.format(p.stimmen)} Stimmen</span>
				{#if anzahlSitze !== undefined}<span class="sitze">{anzahlSitze} {anzahlSitze === 1 ? 'Sitz' : 'Sitze'}</span>{/if}
			</li>
		{/each}
	</ul>
</div>

<style>
	.verhaeltnis { display: grid; grid-template-columns: minmax(12rem, 1fr) minmax(18rem, 2fr); align-items: center; gap: 1.5rem; }
	.torte { width: min(100%, 22rem); aspect-ratio: 1; border-radius: 50%; margin: auto; box-shadow: 0 0 0 1px var(--rand); position: relative; }
	.torte span { position: absolute; inset: 28%; border-radius: 50%; background: var(--flaeche); box-shadow: 0 0 0 1px var(--rand); }
	ul { list-style: none; padding: 0; margin: 0; display: grid; gap: .45rem; }
	li { display: grid; grid-template-columns: auto minmax(7rem, 1fr) auto auto auto; align-items: center; gap: .45rem .7rem; padding: .55rem .7rem; border: 1px solid var(--rand); border-radius: var(--radius-klein); background: color-mix(in srgb, var(--flaeche-2) 72%, transparent); }
	li.ohne-sitz { border-style: dashed; color: var(--text-2); }
	.punkt { width: .8rem; height: .8rem; border-radius: 50%; box-shadow: 0 0 0 1px var(--rand); }
	.name { overflow-wrap: anywhere; }
	.stimmen { color: var(--text-3); font-size: .85em; white-space: nowrap; }
	.sitze { border: 1px solid var(--rand); border-radius: 99px; padding: 0 .45rem; white-space: nowrap; font-size: .85em; }
	.gross { height: 100%; grid-template-columns: minmax(14rem, 1fr) minmax(22rem, 1.6fr); gap: calc(2rem * var(--skala)); }
	.gross .torte { width: min(100%, calc(27rem * var(--skala))); }
	.gross ul { gap: calc(.4rem * var(--skala)); }
	.gross li { font-size: calc(1rem * var(--skala)); padding: calc(.32rem * var(--skala)) calc(.55rem * var(--skala)); }
	@media (max-width: 650px) {
		.verhaeltnis, .gross { height: auto; grid-template-columns: 1fr; }
		.torte, .gross .torte { width: min(68vw, 16rem); }
		li, .gross li { grid-template-columns: auto minmax(0, 1fr) auto; font-size: .95rem; }
		.stimmen { grid-column: 2; white-space: normal; }
		.sitze { grid-column: 3; grid-row: 2; }
	}
</style>
