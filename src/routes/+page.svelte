<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Thema from '$lib/Thema.svelte';
	import WahlAuswahl from '$lib/WahlAuswahl.svelte';
	import Wahlkalender from '$lib/Wahlkalender.svelte';
	import { strom } from '$lib/strom';
	import type { Uebersicht, UebersichtEintrag } from '$lib/server/daten';

	const wahltag = $derived(page.url.searchParams.get('wahltag') ?? '');
	const ansicht = $derived(page.url.searchParams.get('ansicht') === 'wahlen');
	const aktiverWahltag = $derived(wahltag || daten?.wahltag || '');
	const zusatz = $derived(aktiverWahltag ? `?wahltag=${aktiverWahltag}` : '');

	let daten = $state<Uebersicht | undefined>();
	let fehler = $state('');
	let suche = $state('');
	let laedt = $state(true);
	let land = $state('');
	let region = $state('');
	let behoerde = $state('');

	/** `still` für die Nachführung per SSE: die soll die Seite nicht abblenden. */
	async function laden(tag: string, still = false) {
		if (!still) laedt = true;
		try {
			const a = await fetch(`/api/uebersicht${tag ? `?wahltag=${tag}` : ''}`);
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

	// Der Wahltag kommt als Argument, nicht aus `zusatz`: `zusatz` hängt über
	// `aktiverWahltag` an `daten`, das `laden()` selbst setzt. Gelesen würde er
	// synchron vor dem `await`, der Effect hinge also an `daten` — ohne `?wahltag`
	// in der Adresse lief er dadurch zweimal, mit zweitem Voll-Abruf der Übersicht
	// und Abriss samt Neuaufbau der SSE-Verbindung.
	$effect(() => {
		const tag = page.url.searchParams.get('wahltag') ?? '';
		void laden(tag);
		return strom(['uebersicht'], () => void laden(tag, true));
	});

	const gefiltert = $derived(
		(daten?.eintraege ?? []).filter((e) =>
			(!land || e.land === land) && (!region || e.region === region) && (!behoerde || e.ags === behoerde) && `${e.behoerde} ${e.titel}`.toLowerCase().includes(suche.toLowerCase())
		)
	);
	const eindeutig = (x: string[]) => [...new Set(x)].sort((a, b) => a.localeCompare(b, 'de'));
	const laender = $derived(eindeutig((daten?.eintraege ?? []).map((e) => e.land)));
	// Alle sechzehn, nicht nur die beiden ersten: der Poller entdeckt Behörden
	// bundesweit, und ein Kürzel als Überschrift ist keine Information.
	const LAENDER: Record<string, string> = {
		BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg',
		HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
		NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz',
		SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt',
		SH: 'Schleswig-Holstein', TH: 'Thüringen'
	};
	const landName = (x: string) => LAENDER[x] ?? x;
	const name = (ags: string) => daten?.eintraege.find((e) => e.ags === ags)?.behoerde ?? ags;
	const regionName = (r: string) => daten?.eintraege.find((e) => e.region === r)?.regionName ?? r;
	const meldungen = (eintraege: UebersichtEintrag[]) => ({
		eingegangen: eintraege.reduce((summe, e) => summe + (e.stand?.eingegangen ?? 0), 0),
		erwartet: eintraege.reduce((summe, e) => summe + (e.stand?.erwartet ?? 0), 0)
	});
	/**
	 * Die Kacheln der aktuellen Ebene in einem einzigen Durchlauf.
	 *
	 * Vorher filterte der Meldungsstand je Kachel erneut über alle Einträge: bei
	 * knapp zweitausend Wahlen und hundert Kacheln sind das hunderttausende
	 * Durchläufe pro Neuzeichnung — und genau das machte das Durchklicken zäh,
	 * obwohl dabei gar nichts nachgeladen wird.
	 *
	 * Sortiert wird nach dem angezeigten Namen. Vorher entschied der Schlüssel,
	 * weshalb die Regionen nach Regionalschlüssel und damit scheinbar willkürlich
	 * standen.
	 */
	const karten = $derived.by(() => {
		const ebene = !land ? 'land' : !region ? 'region' : 'behoerde';
		const m = new Map<string, { wert: string; titel: string; ein: number; erw: number }>();
		for (const e of daten?.eintraege ?? []) {
			if (land && e.land !== land) continue;
			if (region && e.region !== region) continue;
			const wert = ebene === 'land' ? e.land : ebene === 'region' ? e.region : e.ags;
			const titel = ebene === 'land' ? landName(e.land) : ebene === 'region' ? e.regionName : e.behoerde;
			const k = m.get(wert) ?? { wert, titel, ein: 0, erw: 0 };
			k.ein += e.stand?.eingegangen ?? 0;
			k.erw += e.stand?.erwartet ?? 0;
			m.set(wert, k);
		}
		return [...m.values()].sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
	});

	const gesamt = $derived.by(() => {
		const e = (daten?.eintraege ?? []).filter((x) =>
			(!land || x.land === land) && (!region || x.region === region) && (!behoerde || x.ags === behoerde));
		const { eingegangen: ein, erwartet: erw } = meldungen(e);
		return { ein, erw, prozent: erw > 0 ? Math.round((ein / erw) * 100) : 0 };
	});
	const gesamtEbene = $derived.by(() => {
		if (behoerde) return `in der ${name(behoerde)}`;
		if (region) return `${regionName(region).startsWith('Landkreis') ? 'im' : 'in der'} ${regionName(region)}`;
		const ausgewaehltesLand = land || (laender.length === 1 ? laender[0] : '');
		return ausgewaehltesLand ? `in ${landName(ausgewaehltesLand)}` : 'in allen Bundesländern';
	});

	const link = (e: UebersichtEintrag) =>
		`/v?${e.instanzId ? `instanz=${e.instanzId}` : `ags=${e.ags}`}&wahl=${e.wahlId}&gebiet=${e.gebietId}${aktiverWahltag ? `&wahltag=${aktiverWahltag}` : ''}`;

	function terminWechseln(gewaehlt: string) {
		const parameter = new URLSearchParams(page.url.searchParams);
		parameter.set('wahltag', gewaehlt);
		land = region = behoerde = '';
		void goto(`${page.url.pathname}?${parameter}`);
	}

	const datum = (tag: string) => `${tag.slice(6, 8)}.${tag.slice(4, 6)}.${tag.slice(0, 4)}`;
	const fmt = new Intl.NumberFormat('de-DE');

	/** Was am gewählten Termin überhaupt vorliegt — früher stand hier fest „Landkreis Lüneburg". */
	const umfang = $derived.by(() => {
		const wahlen = daten?.eintraege.length ?? 0;
		if (!wahlen) return 'Keine Wahlen an diesem Termin';
		const n = laender.length;
		return `${fmt.format(wahlen)} ${wahlen === 1 ? 'Wahl' : 'Wahlen'} in ${n === 1 ? landName(laender[0]) : `${n} Ländern`}`;
	});
</script>

<main aria-busy={laedt}>
	<header>
		<div>
			<p class="kicker">Wahlergebnisse</p>
			<h1>Votemanager Viewer</h1>
			<p class="unter">
				{umfang}{aktiverWahltag ? ` · Wahltag ${datum(aktiverWahltag)}` : ' · Noch kein Wahltermin bekannt'}
			</p>
		</div>
		<div class="werkzeuge">
			<div class="termin">
				<span>Wahltermin</span>
				<Wahlkalender termine={daten?.termine ?? []} wert={aktiverWahltag} onwaehlen={terminWechseln} />
			</div>
			<Thema />
			<a class="knopf" href="/praesentation{zusatz}">Präsentation starten →</a>
		</div>
	</header>

	{#if !ansicht}
		<section class="startseite" aria-label="Schnellzugriff">
			<h2>Was möchtest du ansehen?</h2>
			<div class="startkarten">
				<a href={`/wahlen${zusatz}`}><strong>Wahlen durchsuchen</strong><span>Land → Region → Behörde → Wahl</span></a>
				<a href={`/praesentation${zusatz}`}><strong>Präsentation starten</strong><span>Für Bildschirm und Beamer</span></a>
			</div>
		</section>
	{:else}
		<a class="zurueck-start" href={`/${zusatz}`}>← Startseite</a>
	{/if}

	<p class="ohnegewaehr">
		Eigene Berechnung nach dem Kommunalwahlrecht des jeweiligen Landes auf Grundlage der von
		votemanager veröffentlichten Zwischenstände. <strong>Ohne Gewähr</strong> — amtlich ist
		allein die Feststellung des Wahlausschusses.
	</p>

	{#if ansicht && daten}
		<div class="gesamt">
			<strong class="zahl">{gesamt.prozent} %</strong>
			<span>aller Schnellmeldungen {gesamtEbene} ausgezählt</span>
			<span class="zahl klein">({gesamt.ein} von {gesamt.erw})</span>
		</div>
	{/if}

	{#if fehler}
		<p class="hinweis">Daten konnten nicht geladen werden: {fehler}</p>
	{:else if laedt}
		<p class="laedt">Lade Vertretungen …</p>
	{/if}

	{#if daten}
		{#if !daten.wahltermine.length}<p class="leer" role="status">Noch keine Wahltermine bekannt.</p>{/if}
		<input class="suche" type="search" bind:value={suche} placeholder="Vertretung suchen …" aria-label="Vertretung suchen" />

		<nav class="hierarchie" aria-label="Wahlebene">
			{#if !land}<div class="karten">{#each karten as k (k.wert)}<button onclick={() => (land = k.wert)}><strong>{k.titel}</strong><span>{k.ein} von {k.erw} Schnellmeldungen</span></button>{/each}</div>
			{:else if !region}<button class="zurueck" onclick={() => (land = '')}>← Bundesländer</button><div class="karten">{#each karten as k (k.wert)}<button onclick={() => (region = k.wert)}><strong>{k.titel}</strong><span>{k.ein} von {k.erw} Schnellmeldungen</span></button>{/each}</div>
			{:else if !behoerde}<button class="zurueck" onclick={() => (region = '')}>← Regionen</button><div class="karten">{#each karten as k (k.wert)}<button onclick={() => (behoerde = k.wert)}><strong>{k.titel}</strong><span>{k.ein} von {k.erw} Schnellmeldungen</span></button>{/each}</div>
			{:else}<button class="zurueck" onclick={() => (behoerde = '')}>← Behörden</button>
			<section>
				<h2>{name(behoerde)}</h2>
				<ul>
					{#each gefiltert as e (e.ags + e.wahlId + e.gebietId)}
						{@const p =
							e.stand && e.stand.erwartet > 0
								? Math.round((e.stand.eingegangen / e.stand.erwartet) * 100)
								: 0}
						<li>
							<a href={link(e)}>
								<span class="titel">{e.titel}</span>
								<span class="meta">
									{#if e.direktwahl}
										<span class="marke">Direktwahl</span>
									{:else if e.sitze}
										{@const HERKUNFT = { amtlich: 'aus dem laufenden Ergebnis', hinterlegt: 'aus der Bekanntmachung der Wahlleitung', berechnet: 'nach § 46 NKomVG aus der Einwohnerzahl gerechnet, nicht amtlich bestätigt', vorwahl: 'Sitzzahl der Vorwahl, nicht amtlich bestätigt' }}
										<span class="marke" class:geschaetzt={e.sitzeHerkunft && e.sitzeHerkunft !== 'amtlich'}
											title="Sitzzahl {HERKUNFT[e.sitzeHerkunft ?? 'amtlich']}{e.sitzeStand ? ` (Stand ${e.sitzeStand.slice(6, 8)}.${e.sitzeStand.slice(4, 6)}.${e.sitzeStand.slice(0, 4)})` : ''}">{e.sitze} Sitze{e.sitzeHerkunft && e.sitzeHerkunft !== 'amtlich' ? '*' : ''}</span>
									{:else}
										<span class="marke fehlt">Sitzzahl unbekannt</span>
									{/if}
									<span class="zahl stand">{e.stand?.text ?? '—'}</span>
								</span>
								<span class="balken"><span style:width="{p}%" class:fertig={p >= 100}></span></span>
							</a>
							{#if e.vergleichbar}<a class="vergleich" href={`/vergleich?instanz=${e.instanzId}&wahl=${e.wahlId}&gebiet=${e.gebietId}${aktiverWahltag ? `&wahltag=${aktiverWahltag}` : ''}`}>Vergleichen</a>{/if}
						</li>
					{/each}
				</ul>
			</section>
			{/if}
		</nav>

		{#if gefiltert.length === 0}
			<p class="leer" role="status">Keine Vertretung passt zur Suche.</p>
		{/if}
	{/if}

	{#if ansicht}<details class="praesentationsauswahl">
		<summary>Individuelle Präsentation zusammenstellen</summary>
		<WahlAuswahl titel="Wahlen für die Präsentation auswählen" />
	</details>{/if}
</main>

<style>
	main {
		max-width: var(--inhalt);
		margin: 0 auto;
		padding: clamp(1.25rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem) 5rem;
	}

	.startseite { margin: 2rem 0; }
	.startseite h2 { font-size: clamp(1.3rem, 3vw, 2rem); text-transform: none; letter-spacing: normal; color: var(--text); }
	.startkarten { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 1rem; }
	.startkarten a { display: grid; gap: .45rem; min-height: 8rem; padding: 1.25rem; border: 1px solid var(--rand); border-radius: var(--radius); background: var(--flaeche); color: var(--text); text-decoration: none; box-shadow: var(--schatten); }
	.startkarten a:hover { border-color: var(--akzent); transform: translateY(-2px); }
	.startkarten span { color: var(--text-2); font-size: .9rem; }
	.zurueck-start { display: inline-flex; min-height: 44px; align-items: center; margin: 1rem 0; }

	header {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		justify-content: space-between;
		align-items: center;
	}

	h1 {
		font-size: clamp(2rem, 5vw, 3.6rem);
		letter-spacing: -0.045em;
	}

	.kicker { margin: 0 0 .35rem; color: var(--akzent); font-size: .78rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }

	.unter {
		margin: 0.25rem 0 0;
		color: var(--text-2);
	}

	.werkzeuge {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem;
	}

	.termin { display: grid; gap: .2rem; color: var(--text-2); font-size: .75rem; }

	.knopf {
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		min-height: 44px;
		display: inline-flex;
		align-items: center;
		padding: 0.55rem 0.95rem;
		text-decoration: none;
		background: var(--akzent);
		color: var(--auf-akzent);
		font-weight: 700;
	}

	.ohnegewaehr {
		font-size: 0.85rem;
		color: var(--text-2);
		border-left: 3px solid var(--rand);
		padding-left: 0.8rem;
		margin: 1.25rem 0;
	}

	.gesamt {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		background: linear-gradient(120deg, color-mix(in srgb, var(--akzent) 15%, var(--flaeche)), var(--flaeche-2));
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		padding: clamp(1rem, 3vw, 1.5rem);
		margin-bottom: 1.25rem;
	}

	.gesamt strong {
		font-size: clamp(1.8rem, 5vw, 2.8rem);
		color: var(--akzent);
	}

	.klein {
		color: var(--text-3);
		font-size: 0.85rem;
	}

	.suche {
		width: 100%;
		min-height: 48px;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		background: var(--flaeche);
		color: var(--text);
		font: inherit;
		margin-bottom: 1.5rem;
	}

	section {
		margin-bottom: 1.75rem;
	}

	.hierarchie { display: grid; gap: .75rem; }
	.karten { display: grid; grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr)); gap: .75rem; }
	.karten button, .zurueck { min-height: 64px; padding: 1rem; border: 1px solid var(--rand); border-radius: var(--radius); background: var(--flaeche); color: var(--text); text-align: left; font: inherit; cursor: pointer; }
	.karten button { display: grid; gap: .3rem; }
	.karten button span { color: var(--text-2); font-size: .82rem; }
	.zurueck { min-height: 44px; padding: .55rem .8rem; }
	.vergleich { display: inline-flex; margin-top: .45rem; font-size: .8rem; }

	h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-2);
		margin-bottom: 0.5rem;
	}

	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}

	li a {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 0.3rem 1rem;
		padding: 0.85rem 1rem;
		border: 1px solid var(--rand);
		border-radius: var(--radius);
		text-decoration: none;
		color: var(--text);
		background: color-mix(in srgb, var(--flaeche) 92%, transparent);
		box-shadow: 0 6px 18px color-mix(in srgb, var(--text) 5%, transparent);
		transition: border-color .15s ease, transform .15s ease, background .15s ease;
	}

	li a:hover, li a:focus-visible {
		background: var(--flaeche-2);
		border-color: color-mix(in srgb, var(--akzent) 55%, var(--rand));
		transform: translateY(-1px);
	}

	.titel {
		font-weight: 500;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-size: 0.82rem;
		color: var(--text-2);
	}

	.marke {
		border: 1px solid var(--rand);
		border-radius: 99px;
		padding: 0 0.5rem;
		white-space: nowrap;
	}

	/* Der Stern trennt eine amtliche Zahl von einer erwarteten. Nie Farbe allein:
	   das Zeichen steht im Text, die Herkunft im title. */
	.marke.geschaetzt {
		border-style: dashed;
	}

	.marke.fehlt {
		color: var(--warn);
		background: var(--warn-flaeche);
		border-color: transparent;
	}

	.stand {
		white-space: nowrap;
	}

	.balken {
		grid-column: 1 / -1;
		height: 4px;
		background: var(--flaeche-2);
		border-radius: 99px;
		overflow: hidden;
	}

	.balken span {
		display: block;
		height: 100%;
		background: var(--akzent);
	}

	.balken span.fertig {
		background: #2e7d32;
	}

	.laedt {
		color: var(--text-2);
	}

	/* Beim Terminwechsel bleibt die alte Liste stehen, bis die neue da ist —
	   ohne Rückmeldung wirkt das wie ein Hänger. Abblenden statt leerräumen:
	   ein Leerräumen erzeugt nur ein Blinken. */
	main[aria-busy='true'] {
		opacity: 0.55;
		transition: opacity 0.15s ease;
	}

	.leer { padding: 2rem; text-align: center; color: var(--text-2); border: 1px dashed var(--rand); border-radius: var(--radius); }

	.praesentationsauswahl { margin-top: 3rem; border-top: 1px solid var(--rand); padding-top: 1.25rem; }
	.praesentationsauswahl summary { min-height: 44px; display: flex; align-items: center; color: var(--text-2); font-weight: 700; cursor: pointer; }
	.praesentationsauswahl[open] summary { color: var(--text); }

	@media (max-width: 680px) {
		header { align-items: flex-start; }
		.werkzeuge { width: 100%; justify-content: space-between; }
		.gesamt { align-items: flex-start; flex-wrap: wrap; }
		.gesamt strong { width: 100%; }
		li a { grid-template-columns: 1fr; }
		.meta { justify-content: space-between; }
	}

	@media (max-width: 420px) {
		.werkzeuge { align-items: stretch; }
		.knopf { width: 100%; justify-content: center; }
		.meta { align-items: flex-start; flex-direction: column; gap: .4rem; }
	}
</style>
