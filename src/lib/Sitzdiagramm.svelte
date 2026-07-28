<script lang="ts">
	import type { Sitz } from '$lib/nkwg';
	import { plaetze as arcPlaetze, punktRadius } from '$lib/sitzarc';

	let { sitze, groesse = 460 }: { sitze: Sitz[]; groesse?: number } = $props();

	const radius = $derived(groesse / 2);
	const punktR = $derived(sitze.length ? punktRadius(radius, sitze.length) : 0);

	/**
	 * Die viewBox muss den Punktradius einschließen — die äußersten Plätze
	 * liegen auf der Mittellinie und ragen um genau einen Radius nach unten.
	 */
	const hoehe = $derived(radius + punktR + 4);

	/** Halbkreis-Sitzverteilung, Sitze in der übergebenen Reihenfolge links→rechts. */
	const plaetze = $derived.by(() => {
		const n = sitze.length;
		if (n === 0) return [];
		const wirksam = radius - punktR - 2;
		return arcPlaetze(n).map((p, i) => ({
			x: radius + Math.cos(p.winkel) * p.r * wirksam,
			y: radius - Math.sin(p.winkel) * p.r * wirksam,
			r: punktR,
			sitz: sitze[i]
		}));
	});
</script>

<svg
	viewBox="0 0 {groesse} {hoehe}"
	width="100%"
	role="img"
	aria-label="Sitzverteilung mit {sitze.length} Sitzen"
>
	{#each plaetze as p (p.x + ':' + p.y)}
		<circle
			cx={p.x}
			cy={p.y}
			r={p.r}
			fill={p.sitz.unbesetzt ? 'transparent' : (p.sitz.farbe ?? 'var(--text-3)')}
			stroke={p.sitz.unbesetzt ? 'var(--text-3)' : 'var(--flaeche)'}
			stroke-width={p.sitz.unbesetzt ? 2 : 1.5}
			stroke-dasharray={p.sitz.unbesetzt ? '3 2' : undefined}
		>
			<title
				>{p.sitz.partei} — {p.sitz.unbesetzt
					? 'unbesetzt'
					: `${p.sitz.name} (${p.sitz.mandat})`}</title
			>
		</circle>
	{/each}
</svg>

<!--
	Ein Ring in Flächenfarbe um jeden Punkt: trennt benachbarte Sitze und hält
	sehr dunkle Parteifarben (z. B. CDU-Schwarz) im Dark Mode sichtbar.
	Unbesetzte Sitze sind hohl und gestrichelt — nicht nur farblich anders.
-->
