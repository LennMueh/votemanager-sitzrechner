<script lang="ts">
	import Sitzdiagramm from './Sitzdiagramm.svelte';
	import Stimmverhaeltnis from './Stimmverhaeltnis.svelte';
	import type { VertretungErgebnis } from '$lib/server/daten';

	// Detailansicht am Schreibtisch: Diagramm plus vollständige Tabelle.
	// Die Beamer-Darstellung liegt in src/lib/praesentation/.
	let { ergebnis }: { ergebnis: VertretungErgebnis } = $props();

	const stand = $derived(ergebnis.stand);
	const prozent = $derived(
		stand.erwartet > 0 ? Math.round((stand.eingegangen / stand.erwartet) * 100) : 0
	);
	const gewaehlte = $derived(ergebnis.verteilung?.sitze.filter((s) => s.name) ?? []);
	const unbesetzt = $derived(ergebnis.verteilung?.sitze.filter((s) => s.unbesetzt) ?? []);
	const mitSitzen = $derived(ergebnis.verteilung?.parteien.filter((p) => p.sitze > 0) ?? []);
	const mehrereBereiche = $derived(ergebnis.wahlbereiche.length > 1);

	const fmt = new Intl.NumberFormat('de-DE');
	const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<article>
	<header>
		<div>
			<h2>{ergebnis.ref.titel}</h2>
			<p class="behoerde">{ergebnis.ref.behoerde}</p>
		</div>
		<div class="stand">
			<strong class="zahl">{stand.eingegangen} von {stand.erwartet}</strong>
			<span>Schnellmeldungen</span>
			<div class="balken" role="img" aria-label="{prozent} Prozent ausgezählt">
				<div style:width="{prozent}%" class:fertig={stand.vollstaendig}></div>
			</div>
			<span class="zahl">{prozent} % ausgezählt</span>
		</div>
	</header>

	{#if ergebnis.stale}
		<p class="hinweis">
			votemanager war zuletzt nicht erreichbar — angezeigt wird der letzte erfolgreich
			abgerufene Stand von {new Date(ergebnis.zeitpunkt).toLocaleTimeString('de-DE')}.
		</p>
	{/if}

	{#if ergebnis.warnung}
		<p class="hinweis">{ergebnis.warnung}</p>
	{/if}

	{#if !stand.vollstaendig && stand.erwartet > 0}
		<p class="zwischenstand">
			Zwischenstand — die Sitzverteilung kann sich mit jeder weiteren Schnellmeldung ändern.
		</p>
	{/if}

	<!-- ------------------------------------------------------------------ -->
	<!-- Direktwahl (§ 45g)                                                  -->
	<!-- ------------------------------------------------------------------ -->
	{#if ergebnis.direkt}
		{@const d = ergebnis.direkt}
		{#if d.gewaehlt}
			<p class="ergebnissatz">
				<strong>{d.gewaehlt.name}</strong> ist mit absoluter Mehrheit gewählt.
			</p>
		{:else if d.stichwahl}
			<p class="ergebnissatz">
				Keine absolute Mehrheit — Stichwahl am 27.09.2026 zwischen
				<strong>{d.stichwahl[0]?.name}</strong> und <strong>{d.stichwahl[1]?.name}</strong>.
			</p>
		{/if}
		<table>
			<thead>
				<tr><th>Bewerber/in</th><th class="r">Stimmen</th><th class="r">Anteil</th></tr>
			</thead>
			<tbody>
				{#each d.bewerber as b (b.name)}
					<tr class:gewaehlt={d.gewaehlt?.name === b.name}>
						<td><span class="punkt" style:background={b.farbe ?? 'var(--text-3)'}></span>{b.name}</td>
						<td class="r zahl">{fmt.format(b.stimmen)}</td>
						<td class="r zahl">{pct.format(b.prozent)} %</td>
					</tr>
				{/each}
			</tbody>
		</table>
		{#if d.losentscheid}
			<p class="hinweis">{d.losentscheid} — es entscheidet das Los (§ 45g NKWG).
				{#if d.losfall?.vorlaeufig.length} Provisorisch angezeigt: {d.losfall.vorlaeufig.join(', ')}.{/if}
			</p>
		{/if}

		<!-- ------------------------------------------------------------------ -->
		<!-- Ratswahl (§ 36 / § 37)                                              -->
		<!-- ------------------------------------------------------------------ -->
	{:else}
		{#if ergebnis.verteilung}
			<Sitzdiagramm sitze={ergebnis.verteilung.sitze} groesse={460} />

		<!-- Legende: Partei immer im Klartext, nie nur über die Farbe. -->
		<ul class="legende">
			{#each mitSitzen as p (p.partei)}
				<li>
					<span class="punkt" style:background={p.farbe ?? 'var(--text-3)'}></span>
					<strong>{p.partei}</strong>
					<span class="zahl sitzzahl">{p.sitze}</span>
					<span class="anteil zahl">{pct.format(p.prozent)} %</span>
				</li>
			{/each}
			{#if unbesetzt.length}
				<li>
					<span class="punkt leer"></span>
					<strong>unbesetzt</strong>
					<span class="zahl sitzzahl">{unbesetzt.length}</span>
				</li>
			{/if}
		</ul>

		{#if ergebnis.verteilung.losentscheide.length}
			<div class="hinweis">
				<strong>Losentscheid nötig</strong> — das Gesetz lässt hier losen, das Ergebnis steht
				insoweit nicht fest:
				<ul>
					{#each ergebnis.verteilung.losfaelle as l (l.kontext)}
						<li>{l.text}; provisorisch ausgewählt: {l.vorlaeufig.join(', ') || 'niemand'}.</li>
					{/each}
				</ul>
			</div>
		{/if}

		<!-- Tabellenansicht: erfüllt zugleich die Anforderung, dass die Information
		     nicht nur grafisch vorliegt. -->
			<table>
			<thead>
				<tr>
					<th>Partei</th>
					<th>Name</th>
					{#if mehrereBereiche}<th>Wahlbereich</th>{/if}
					<th>Mandat</th>
					<th class="r">Stimmen</th>
				</tr>
			</thead>
			<tbody>
				{#each gewaehlte as s, i (s.partei + '|' + s.name + i)}
					<tr>
						<td><span class="punkt" style:background={s.farbe ?? 'var(--text-3)'}></span>{s.partei}</td>
						<td>{s.name}</td>
						{#if mehrereBereiche}<td class="klein">{s.wahlbereich ?? ''}</td>{/if}
						<td class="klein">{s.mandat}</td>
						<td class="r zahl">{fmt.format(s.stimmen ?? 0)}</td>
					</tr>
				{/each}
				{#each unbesetzt as s, i (s.partei + i)}
					<tr class="unbesetzt">
						<td><span class="punkt leer"></span>{s.partei}</td>
						<td colspan={mehrereBereiche ? 3 : 2}>
							unbesetzt — {s.grund}
						</td>
						<td></td>
					</tr>
				{/each}
			</tbody>
			</table>
		{/if}

		{#if ergebnis.stimmverhaeltnis}
			<h3>Stimmenverhältnis aller Parteien und Listen</h3>
			<Stimmverhaeltnis verhaeltnis={ergebnis.stimmverhaeltnis} verteilung={ergebnis.verteilung} />
		{/if}
	{/if}
</article>

<style>
	article {
		background: var(--flaeche);
		color: var(--text);
	}

	header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
	}

	h2 {
		font-size: 1.35rem;
	}

	h3 { margin-top: 1.75rem; }

	.behoerde {
		margin: 0.15rem 0 0;
		color: var(--text-2);
		font-size: 0.9rem;
	}

	.stand {
		text-align: right;
		font-size: 0.85rem;
		color: var(--text-2);
		min-width: 190px;
	}

	.stand strong {
		display: block;
		font-size: 1.1rem;
		color: var(--text);
	}

	.balken {
		height: 7px;
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: 99px;
		overflow: hidden;
		margin: 0.4rem 0 0.25rem;
	}

	.balken div {
		height: 100%;
		background: var(--akzent);
		transition: width 0.4s ease;
	}

	.balken div.fertig {
		background: #2e7d32;
	}

	.zwischenstand {
		color: var(--text-2);
		font-size: 0.85rem;
		margin: 0 0 0.75rem;
	}

	.ergebnissatz {
		font-size: 1.05rem;
	}

	.legende {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 1.1rem;
		padding: 0;
		margin: 0.75rem 0 1.25rem;
	}

	.legende li {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.92rem;
	}

	.sitzzahl {
		background: var(--flaeche-2);
		border: 1px solid var(--rand);
		border-radius: 99px;
		padding: 0 0.45rem;
		font-size: 0.85rem;
	}

	.anteil {
		color: var(--text-3);
		font-size: 0.82rem;
	}

	.punkt {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		display: inline-block;
		flex: none;
		/* Ring in Flächenfarbe: hält auch sehr dunkle Parteifarben sichtbar. */
		box-shadow: 0 0 0 1px var(--rand);
		margin-right: 0.4rem;
		vertical-align: -1px;
	}

	.punkt.leer {
		background: transparent;
		border: 2px dashed var(--text-3);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th,
	td {
		text-align: left;
		padding: 0.4rem 0.5rem;
		border-bottom: 1px solid var(--rand);
	}

	th {
		color: var(--text-2);
		font-weight: 600;
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.r {
		text-align: right;
	}

	.klein {
		color: var(--text-2);
		font-size: 0.85rem;
	}

	tr.unbesetzt td {
		color: var(--text-3);
		font-style: italic;
	}


	tr.gewaehlt td {
		font-weight: 600;
	}

</style>
