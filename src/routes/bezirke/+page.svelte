<script lang="ts">
	// Wahllokale einer Wahl: welche sind ausgezählt, und was kam dort heraus.
	//
	// Die Liste stammt aus *einem* archivierten Dokument je Wahl (der
	// Bezirksübersicht), beschränkt auf das angezeigte Gebiet. Das Detail einer
	// Zeile wird erst beim Aufklappen nachgeladen: diese Dokumente holt der
	// Poller mit Priorität 45 und am Wahlabend entsprechend spät.
	import { page } from '$app/state';
	import { strom } from '$lib/strom';
	import { stimmenverhaeltnis } from '$lib/nkwg';
	import type { Wahlbezirke } from '$lib/server/daten';
	import type { GebietsErgebnis } from '$lib/votemanager';

	const abfrage = $derived(page.url.searchParams.toString());
	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');

	let daten = $state<Wahlbezirke | undefined>();
	let fehler = $state('');
	let laedt = $state(true);

	type Detail = { erg?: GebietsErgebnis & { zeitpunkt: string }; fehler?: string };
	let detail = $state<Record<string, Detail>>({});
	let offen = $state<string[]>([]);

	const ref = $derived(daten?.ref);
	const prozent = $derived(daten && daten.gesamt > 0 ? Math.round((daten.ausgezaehlt / daten.gesamt) * 100) : 0);
	const zurueck = $derived(`/v?${abfrage}`);

	// Als sortierter String abgeleitet, nicht als Array: ein abgeleitetes Array
	// ist nach jedem Abruf eine neue Referenz und risse die SSE-Verbindung ab.
	const stromSchluessel = $derived(
		!ref?.instanzId || !daten?.ebeneId
			? ''
			: [
					`b:i${ref.instanzId}:${ref.wahlId}:${daten.ebeneId}`,
					...offen.map((id) => `v:i${ref.instanzId}:${ref.wahlId}:${id}`)
				]
					.sort()
					.join(',')
	);

	async function laden(still = false) {
		if (!still) laedt = true;
		try {
			const a = await fetch(`/api/wahlbezirke?${abfrage}`);
			const j = await a.json();
			if (!a.ok) throw new Error(j.fehler ?? a.statusText);
			daten = j;
			fehler = '';
		} catch (e) {
			fehler = String(e);
		} finally {
			laedt = false;
		}
	}

	async function ladeDetail(id: string) {
		if (!ref?.instanzId) return;
		const p = new URLSearchParams({
			instanz: String(ref.instanzId),
			wahl: String(ref.wahlId),
			gebiet: ref.gebietId,
			bezirk: id
		});
		try {
			const a = await fetch(`/api/wahlbezirke?${p}`);
			const j = await a.json();
			if (!a.ok) throw new Error(j.fehler ?? a.statusText);
			detail = { ...detail, [id]: { erg: j } };
		} catch (e) {
			detail = { ...detail, [id]: { fehler: String(e) } };
		}
	}

	function umschalten(id: string) {
		if (offen.includes(id)) {
			offen = offen.filter((x) => x !== id);
			return;
		}
		offen = [...offen, id];
		void ladeDetail(id);
	}

	$effect(() => {
		abfrage; // bei geänderter Wahl neu laden und alles Aufgeklappte vergessen
		offen = [];
		detail = {};
		void laden();
	});

	$effect(() => {
		if (!stromSchluessel) return;
		const schluessel = stromSchluessel.split(',');
		return strom(schluessel, (s) => {
			// Ohne Schlüssel (Reset) alles neu, sonst nur das Betroffene.
			if (!s || s.startsWith('b:')) void laden(true);
			if (!s || s.startsWith('v:')) {
				for (const id of s ? [s.slice(s.lastIndexOf(':') + 1)] : offen) void ladeDetail(id);
			}
		});
	});

	const fmt = new Intl.NumberFormat('de-DE');
	const pct = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
</script>

<main aria-busy={laedt}>
	<a class="zurueck" href={zurueck}>← Zurück zur Wahl</a>

	{#if fehler}
		<p class="hinweis">{fehler}</p>
	{:else if daten}
		<header>
			<div>
				<h2>{daten.ebeneName} — {daten.ref.gebietName ?? daten.ref.behoerde}</h2>
				<p class="behoerde">{daten.ref.titel}, {daten.ref.behoerde}</p>
			</div>
			<div class="stand">
				<strong class="zahl">{daten.ausgezaehlt} von {daten.gesamt}</strong>
				<span>Wahllokalen ausgezählt</span>
				<div class="balken" role="img" aria-label="{prozent} Prozent der Wahllokale ausgezählt">
					<div style:width="{prozent}%" class:fertig={daten.gesamt > 0 && daten.ausgezaehlt === daten.gesamt}></div>
				</div>
				<span class="zahl">{prozent} %</span>
				<!-- Die Beteiligung des ganzen Gebiets, wie in der Detailansicht der
				     Wahl. Nicht die Summe der Zeilen: Briefwahlbezirke führen keine
				     Wahlberechtigten, ihre Wähler zählen im Urnenbezirk mit. -->
				{#if daten.beteiligung}
					<p class="beteiligung">
						<span class="zahl">{pct.format(daten.beteiligung.anteil * 100)} %</span> Wahlbeteiligung
						<span class="klein zahl">
							({fmt.format(daten.beteiligung.waehler)} von {fmt.format(daten.beteiligung.berechtigte)})
						</span>
					</p>
				{/if}
			</div>
		</header>

		{#if daten.stale}
			<p class="hinweis">
				votemanager war zuletzt nicht erreichbar — angezeigt wird der letzte erfolgreich
				abgerufene Stand.
			</p>
		{/if}

		{#if daten.hinweis}
			<p class="hinweis">{daten.hinweis}</p>
		{:else}
			<div class="tabelle" role="region" aria-label="Ergebnisse der Wahllokale" tabindex="-1"><table>
				<thead>
					<tr>
						<th>Wahllokal</th>
						<th>Stand</th>
						<th class="r">Wahlberechtigte</th>
						<th class="r">Beteiligung</th>
						{#each daten.spalten as s (s.label)}<th class="r">{s.label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each daten.bezirke as b (b.id)}
						{@const auf = offen.includes(b.id)}
						<tr>
							<td>
								<button type="button" class="aufklappen" aria-expanded={auf} onclick={() => umschalten(b.id)}>
									<span class="pfeil" aria-hidden="true">{auf ? '▾' : '▸'}</span>{b.name}
								</button>
							</td>
							<td class="klein">
								<span class="marke" class:fertig={b.ausgezaehlt}>
									{b.standText || (b.ausgezaehlt ? 'ausgezählt' : 'ausstehend')}
								</span>
							</td>
							<td class="r zahl">{b.beteiligung ? fmt.format(b.beteiligung.berechtigte) : '—'}</td>
							<td class="r zahl">{b.beteiligung ? `${pct.format(b.beteiligung.anteil * 100)} %` : '—'}</td>
							{#if b.stimmen.length}
								{#each b.stimmen as s, i (daten.spalten[i].label)}
									<td class="r zahl">
										<span class="wert">{fmt.format(s.absolut)}</span>
										<span class="klein">{pct.format(s.anteil * 100)} %</span>
									</td>
								{/each}
							{:else}
								{#each daten.spalten as s (s.label)}<td class="r fehlt">—</td>{/each}
							{/if}
						</tr>
						{#if auf}
							<tr class="detailzeile">
								<td colspan={4 + daten.spalten.length}>
									{#if detail[b.id]?.fehler}
										<p class="hinweis">{detail[b.id].fehler}</p>
									{:else if detail[b.id]?.erg}
										{@const e = detail[b.id].erg!}
										{@const v = stimmenverhaeltnis([{ id: b.id, name: b.name, vorschlaege: e.vorschlaege }])}
										<table class="innen">
											<thead>
												<tr><th>Wahlvorschlag</th><th class="r">Stimmen</th><th class="r">Anteil</th></tr>
											</thead>
											<tbody>
												{#each v.parteien as p (p.partei)}
													<tr>
														<td>
															<span class="punkt" style:background={p.farbe ?? 'var(--text-3)'}></span>{p.partei}
														</td>
														<td class="r zahl">{fmt.format(p.stimmen)}</td>
														<td class="r zahl">{pct.format(p.prozent)} %</td>
													</tr>
												{/each}
											</tbody>
										</table>
										<dl class="kennzahlen">
											{#each Object.entries(e.kennzahlen) as [k, wert] (k)}
												<div><dt>{k}</dt><dd class="zahl">{fmt.format(wert)}</dd></div>
											{/each}
										</dl>
										<p class="klein">Dieses Wahllokal-Dokument wurde archiviert am
											{new Date(e.zeitpunkt).toLocaleString('de-DE')}.</p>
									{:else}
										<p class="klein">Lade …</p>
									{/if}
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table></div>
			{#if daten.ohneErgebnis > 0}
				<p class="klein fussnote">
					Für {daten.ohneErgebnis} von {daten.gesamt} Wahllokalen liegt das Einzelergebnis
					noch nicht im Archiv; dort bleiben die Stimmspalten leer. Der Auszählstand steht
					trotzdem, er kommt aus der Übersicht der Wahl.
				</p>
			{/if}
		{/if}
	{:else}
		<p class="laedt">Lade …</p>
	{/if}
</main>

<style>
	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem) 4rem;
	}

	.zurueck {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		margin-bottom: 1.25rem;
		text-decoration: none;
		font-size: 0.9rem;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 1rem;
		flex-wrap: wrap;
	}
	h2 {
		margin: 0 0 0.2rem;
		font-size: clamp(1.15rem, 3vw, 1.5rem);
	}
	.behoerde {
		margin: 0;
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
	.beteiligung {
		margin: 0.6rem 0 0;
	}

	.tabelle {
		max-width: 100%;
		overflow-x: auto;
		scrollbar-gutter: stable;
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
		vertical-align: top;
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
	/* Zahl über Anteil statt nebeneinander: Svelte schneidet ein führendes
	   Leerzeichen im Span weg, und bei sieben Parteispalten fehlt die Breite. */
	td .wert,
	td .klein {
		display: block;
		line-height: 1.25;
	}
	.fehlt {
		color: var(--text-3);
	}
	.fussnote {
		margin-top: 0.75rem;
	}

	.aufklappen {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		min-height: 44px;
		background: none;
		border: 0;
		padding: 0;
		color: inherit;
		font: inherit;
		text-align: left;
		cursor: pointer;
	}
	.aufklappen:hover {
		text-decoration: underline;
	}
	.pfeil {
		color: var(--text-3);
	}

	/* Nie Farbe allein: der Wortlaut des Hosts steht in der Marke selbst. */
	.marke {
		display: inline-block;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius-klein);
		background: var(--flaeche-2);
	}
	.marke.fertig {
		border-color: var(--gut);
		color: var(--gut);
	}

	.detailzeile > td {
		background: var(--flaeche-2);
	}
	table.innen {
		max-width: 32rem;
		font-size: 0.85rem;
	}
	table.innen th,
	table.innen td {
		border-bottom: 1px solid var(--rand);
	}
	.punkt {
		width: 11px;
		height: 11px;
		border-radius: 50%;
		display: inline-block;
		flex: none;
		box-shadow: 0 0 0 1px var(--rand);
		margin-right: 0.4rem;
		vertical-align: -1px;
	}
	.kennzahlen {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1.5rem;
		margin: 0.75rem 0 0.25rem;
		font-size: 0.85rem;
	}
	.kennzahlen div {
		display: flex;
		gap: 0.4rem;
	}
	.kennzahlen dt {
		color: var(--text-2);
	}
	.kennzahlen dd {
		margin: 0;
	}

	.laedt {
		color: var(--text-2);
	}
	main[aria-busy='true'] {
		opacity: 0.55;
		transition: opacity 0.15s ease;
	}

	@media (max-width: 620px) {
		header {
			display: block;
		}
		.stand {
			min-width: 0;
			margin-top: 1rem;
			text-align: left;
		}
		table {
			min-width: 40rem;
		}
	}
</style>
