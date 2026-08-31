<script lang="ts">
	import type { Sitz } from '$lib/nkwg';
	import { DIAGRAMM_INNENABSTAND, plaetze as arcPlaetze, punktRadius } from '$lib/sitzarc';

	let { sitze, groesse = 460 }: { sitze: Sitz[]; groesse?: number } = $props();

	/**
	 * Eigene Muster-Kennung je Komponenteninstanz. Ohne sie kollidieren die
	 * `<pattern>`-IDs, sobald zwei Diagramme auf derselben Seite stehen — dann
	 * zeichnet das zweite mit den Farben des ersten.
	 */
	const kennung = $props.id();

	const radius = $derived(groesse / 2);
	const punktR = $derived(sitze.length ? punktRadius(radius, sitze.length) : 0);

	/**
	 * Die viewBox muss den Punktradius einschließen — die äußersten Plätze
	 * liegen auf der Mittellinie und ragen um genau einen Radius nach unten.
	 */
	const hoehe = $derived(radius + punktR + 4);

	/**
	 * Schraffur je vorkommender Farbe unbesetzter Sitze.
	 *
	 * Die Streifenweite hängt am Punktradius: dasselbe Diagramm wird mit `groesse`
	 * 460 am Schreibtisch und 1400 auf der Leinwand gezeichnet, eine feste Weite
	 * sähe einmal grob und einmal fast leer aus.
	 */
	const periode = $derived(Math.max(3, punktR / 2));
	const schraffuren = $derived([
		...new Set(sitze.filter((s) => s.unbesetzt).map((s) => s.farbe ?? 'var(--text-3)'))
	]);
	const muster = (farbe?: string) =>
		`url(#${kennung}-${schraffuren.indexOf(farbe ?? 'var(--text-3)')})`;

	/** Halbkreis-Sitzverteilung, Sitze in der übergebenen Reihenfolge links→rechts. */
	const plaetze = $derived.by(() => {
		const n = sitze.length;
		if (n === 0) return [];
		const wirksam = radius - punktR - DIAGRAMM_INNENABSTAND;
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
	<defs>
		{#each schraffuren as farbe, i (farbe)}
			<!-- userSpaceOnUse: die Schraffur läuft über alle Punkte durch, statt in
			     jedem Punkt neu anzusetzen — das wirkt deutlich ruhiger. -->
			<pattern
				id="{kennung}-{i}"
				width={periode}
				height={periode}
				patternUnits="userSpaceOnUse"
				patternTransform="rotate(45)"
			>
				<line x1="0" y1="0" x2="0" y2={periode} stroke={farbe} stroke-width={periode / 2} />
			</pattern>
		{/each}
	</defs>
	{#each plaetze as p (p.x + ':' + p.y)}
		<circle
			cx={p.x}
			cy={p.y}
			r={p.r}
			fill={p.sitz.unbesetzt ? muster(p.sitz.farbe) : (p.sitz.farbe ?? 'var(--text-3)')}
			stroke={p.sitz.unbesetzt ? (p.sitz.farbe ?? 'var(--text-3)') : 'var(--flaeche)'}
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

	Unbesetzte Sitze sind schraffiert und gestrichelt umrandet — Textur und Form
	bleiben das Unterscheidungsmerkmal und tragen unabhängig von der Farbe. Beide
	tragen zusätzlich die Farbe des Wahlvorschlags, dem der Sitz zugefallen wäre:
	die Information steht im Datensatz (`Sitz.farbe`, § 36 Abs. 7 NKWG) und ginge
	sonst verloren. Einen Ring in Flächenfarbe braucht es hier nicht — der Punkt
	ist ohnehin nicht gefüllt. Ohne Wahlvorschlag bleibt die Schraffur grau; das
	ist dann die ehrliche Aussage.
-->
