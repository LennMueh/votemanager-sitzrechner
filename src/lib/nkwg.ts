/**
 * Sitzverteilung nach dem Niedersächsischen Kommunalwahlgesetz (NKWG).
 *
 * Reine Rechenlogik, kein I/O — damit direkt testbar.
 *
 * Maßgeblich sind:
 *   § 36  Feststellung des Wahlergebnisses im Wahlgebiet mit einem Wahlbereich
 *   § 37  ... mit mehreren Wahlbereichen
 *   § 45g Direktwahl (absolute Mehrheit, sonst Stichwahl)
 *
 * Beide Ratswahl-Fälle laufen durch dieselbe Funktion `verteileSitze()`:
 * § 36 ist schlicht der Sonderfall „genau ein Wahlbereich".
 */

// ---------------------------------------------------------------------------
// Eingabemodell
// ---------------------------------------------------------------------------

export interface Kandidat {
	name: string;
	stimmen: number;
	/** 1-basierte Position auf dem Wahlvorschlag (Reihenfolge des Stimmzettels). */
	listenplatz: number;
}

export interface Wahlvorschlag {
	/** Stabile Kennung der Partei/Wählergruppe, über Wahlbereiche hinweg gleich. */
	partei: string;
	parteiLang?: string;
	farbe?: string;
	/** „Stimmen für die Partei" — die Stimmen für die Gesamtliste. */
	listenstimmen: number;
	kandidaten: Kandidat[];
	/** Einzelwahlvorschlag nach § 37 Abs. 1: keine Liste, nur eine Person. */
	einzelbewerber?: boolean;
}

export interface Wahlbereich {
	id: string;
	name: string;
	vorschlaege: Wahlvorschlag[];
}

// ---------------------------------------------------------------------------
// Ausgabemodell
// ---------------------------------------------------------------------------

export type Mandatsart = 'personenwahl' | 'liste' | 'uebertrag' | 'unbesetzt';

export interface Sitz {
	partei: string;
	parteiLang?: string;
	farbe?: string;
	wahlbereich?: string;
	/** Fehlt genau dann, wenn der Sitz unbesetzt bleibt. */
	name?: string;
	stimmen?: number;
	listenplatz?: number;
	art: Mandatsart;
	/** Anzeigetext wie bei votemanager: „direkt" bzw. „Listenplatz 2". */
	mandat: string;
	/** Sitz konnte nicht besetzt werden (§ 36 Abs. 7). */
	unbesetzt?: boolean;
	grund?: string;
}

export interface ParteiErgebnis {
	partei: string;
	parteiLang?: string;
	farbe?: string;
	stimmen: number;
	prozent: number;
	sitze: number;
}

export interface Sitzverteilung {
	sitzeGesamt: number;
	gueltigeStimmen: number;
	parteien: ParteiErgebnis[];
	sitze: Sitz[];
	/** Stellen, an denen das Gesetz einen Losentscheid vorsieht (§ 36 Abs. 2 S. 5 u. a.). */
	losentscheide: string[];
}

// ---------------------------------------------------------------------------
// Hare/Niemeyer — § 36 Abs. 2 Sätze 2 bis 5
// ---------------------------------------------------------------------------

export interface HareErgebnis<K> {
	zuteilung: Map<K, number>;
	/** true, wenn an der Zuteilungsgrenze gleiche Zahlenbruchteile stehen. */
	losentscheid: boolean;
}

/**
 * Hare/Niemeyer mit exakter Ganzzahlarithmetik.
 *
 * Bewusst BigInt statt Gleitkomma: bei knappen Zahlenbruchteilen würde ein
 * Rundungsfehler sonst über ein Mandat entscheiden.
 */
export function hareNiemeyer<K>(stimmen: Map<K, number>, sitze: number): HareErgebnis<K> {
	const eintraege = [...stimmen.entries()];
	const zuteilung = new Map<K, number>(eintraege.map(([k]) => [k, 0]));
	const gesamt = eintraege.reduce((s, [, v]) => s + v, 0);
	if (gesamt <= 0 || sitze <= 0) return { zuteilung, losentscheid: false };

	const G = BigInt(gesamt);
	const S = BigInt(sitze);
	const reste: { k: K; rest: bigint }[] = [];
	let vergeben = 0;

	// Satz 3: zunächst so viele Sitze, wie ganze Zahlen entfallen.
	for (const [k, v] of eintraege) {
		const produkt = BigInt(v) * S;
		const ganze = Number(produkt / G);
		zuteilung.set(k, ganze);
		vergeben += ganze;
		reste.push({ k, rest: produkt % G });
	}

	// Satz 4: Restsitze in der Reihenfolge der höchsten Zahlenbruchteile.
	const offen = sitze - vergeben;
	reste.sort((a, b) => (a.rest < b.rest ? 1 : a.rest > b.rest ? -1 : 0));

	// Satz 5: Bei gleichen Zahlenbruchteilen entscheidet das Los — wir lösen das
	// nicht selbst auf, sondern melden es nach oben.
	const losentscheid = offen > 0 && offen < reste.length && reste[offen - 1].rest === reste[offen].rest;

	for (let i = 0; i < offen; i++) {
		zuteilung.set(reste[i].k, zuteilung.get(reste[i].k)! + 1);
	}
	return { zuteilung, losentscheid };
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Gesamtstimmenzahl eines Wahlvorschlags: Liste + alle Bewerber (§ 35 Nr. 4). */
export function gesamtstimmen(v: Wahlvorschlag): number {
	return v.listenstimmen + v.kandidaten.reduce((s, k) => s + k.stimmen, 0);
}

function summeKandidatenstimmen(v: Wahlvorschlag): number {
	return v.kandidaten.reduce((s, k) => s + k.stimmen, 0);
}

/**
 * § 36 Abs. 3 — Mehrheitsklausel.
 *
 * Erhält ein Wahlvorschlag mit mehr als der Hälfte der gültigen Stimmen nicht
 * mehr als die Hälfte der Sitze, bekommt er vorab einen weiteren Sitz aus den
 * nach Zahlenbruchteilen zu vergebenden Sitzen.
 */
function mitMehrheitsklausel<K>(
	stimmen: Map<K, number>,
	sitze: number,
	basis: HareErgebnis<K>
): HareErgebnis<K> {
	const gesamt = [...stimmen.values()].reduce((s, v) => s + v, 0);
	if (gesamt <= 0 || sitze <= 0) return basis;

	let mehrheit: K | undefined;
	for (const [k, v] of stimmen) {
		if (v * 2 > gesamt) mehrheit = k;
	}
	if (mehrheit === undefined) return basis;
	if (basis.zuteilung.get(mehrheit)! * 2 > sitze) return basis;

	// Ganze Zahlen erneut bestimmen, dann der Mehrheitspartei vorab einen
	// Restsitz geben und die übrigen Restsitze normal nach Bruchteilen verteilen.
	const G = BigInt(gesamt);
	const S = BigInt(sitze);
	const zuteilung = new Map<K, number>();
	const reste: { k: K; rest: bigint }[] = [];
	let vergeben = 0;
	for (const [k, v] of stimmen) {
		const produkt = BigInt(v) * S;
		const ganze = Number(produkt / G);
		zuteilung.set(k, ganze);
		vergeben += ganze;
		if (k !== mehrheit) reste.push({ k, rest: produkt % G });
	}
	zuteilung.set(mehrheit, zuteilung.get(mehrheit)! + 1);
	vergeben += 1;

	const offen = sitze - vergeben;
	reste.sort((a, b) => (a.rest < b.rest ? 1 : a.rest > b.rest ? -1 : 0));
	const losentscheid =
		offen > 0 && offen < reste.length && reste[offen - 1].rest === reste[offen].rest;
	for (let i = 0; i < offen && i < reste.length; i++) {
		zuteilung.set(reste[i].k, zuteilung.get(reste[i].k)! + 1);
	}
	return { zuteilung, losentscheid };
}

// ---------------------------------------------------------------------------
// § 36 Abs. 4 bis 6 — Zuteilung innerhalb eines Wahlvorschlags
// ---------------------------------------------------------------------------

interface BewerberErgebnis {
	sitze: Sitz[];
	/** Sitze, die mangels Bewerbern nicht besetzt werden konnten. */
	offen: number;
	losentscheide: string[];
}

function verteileAufBewerber(
	v: Wahlvorschlag,
	bereich: Wahlbereich,
	anzahl: number,
	mehrereWahlbereiche: boolean
): BewerberErgebnis {
	const sitze: Sitz[] = [];
	const losentscheide: string[] = [];
	if (anzahl <= 0) return { sitze, offen: 0, losentscheide };

	const wahlbereich = mehrereWahlbereiche ? bereich.name : undefined;
	const basis = (k: Kandidat | undefined, art: Mandatsart, mandat: string): Sitz => ({
		partei: v.partei,
		parteiLang: v.parteiLang,
		farbe: v.farbe,
		wahlbereich,
		name: k?.name,
		stimmen: k?.stimmen,
		listenplatz: k?.listenplatz,
		art,
		mandat
	});

	// Einzelwahlvorschlag: es gibt nur die eine Person, keine Liste.
	if (v.einzelbewerber) {
		const k = v.kandidaten[0];
		if (!k) return { sitze, offen: anzahl, losentscheide };
		sitze.push(basis(k, 'personenwahl', 'Einzelwahlvorschlag'));
		return { sitze, offen: anzahl - 1, losentscheide };
	}

	const mitStimmen = v.kandidaten.filter((k) => k.stimmen > 0);

	// Abs. 4: Sitze zwischen Liste und der Gesamtheit der Bewerber mit Stimmen
	// aufteilen — wieder nach Hare/Niemeyer.
	const aufteilung = hareNiemeyer(
		new Map([
			['liste', v.listenstimmen],
			['kandidaten', summeKandidatenstimmen(v)]
		]),
		anzahl
	);
	if (aufteilung.losentscheid) {
		losentscheide.push(
			`${v.partei}${wahlbereich ? ` (${wahlbereich})` : ''}: Losentscheid bei der Aufteilung zwischen Liste und Bewerbern (§ 36 Abs. 4)`
		);
	}
	let personenSitze = aufteilung.zuteilung.get('kandidaten') ?? 0;
	let listenSitze = aufteilung.zuteilung.get('liste') ?? 0;

	// Abs. 5 Satz 5: Mehr Personensitze als Bewerber mit Stimmen?
	// Dann gehen die weiteren Sitze auf die Liste über.
	if (personenSitze > mitStimmen.length) {
		listenSitze += personenSitze - mitStimmen.length;
		personenSitze = mitStimmen.length;
	}

	// Abs. 5 Satz 1: höchste Stimmenzahlen zuerst.
	const nachStimmen = [...mitStimmen].sort(
		(a, b) => b.stimmen - a.stimmen || a.listenplatz - b.listenplatz
	);
	if (
		personenSitze > 0 &&
		personenSitze < nachStimmen.length &&
		nachStimmen[personenSitze - 1].stimmen === nachStimmen[personenSitze].stimmen
	) {
		// Satz 4: Bei Stimmengleichheit entscheidet das Los.
		losentscheide.push(
			`${v.partei}${wahlbereich ? ` (${wahlbereich})` : ''}: Stimmengleichheit an der Mandatsgrenze zwischen ${nachStimmen[personenSitze - 1].name} und ${nachStimmen[personenSitze].name} (§ 36 Abs. 5 S. 4)`
		);
	}
	const gewaehlt = new Set<number>();
	for (let i = 0; i < personenSitze; i++) {
		const k = nachStimmen[i];
		gewaehlt.add(k.listenplatz);
		sitze.push(basis(k, 'personenwahl', 'direkt'));
	}

	// Abs. 6: Listensitze in Listenreihenfolge, bereits Gewählte bleiben außer Betracht.
	let offen = 0;
	const rest = v.kandidaten
		.filter((k) => !gewaehlt.has(k.listenplatz))
		.sort((a, b) => a.listenplatz - b.listenplatz);
	for (let i = 0; i < listenSitze; i++) {
		const k = rest[i];
		if (!k) {
			offen = listenSitze - i;
			break;
		}
		sitze.push(basis(k, 'liste', `Listenplatz ${k.listenplatz}`));
	}

	return { sitze, offen, losentscheide };
}

// ---------------------------------------------------------------------------
// § 36 / § 37 — Sitzverteilung einer Vertretung
// ---------------------------------------------------------------------------

/**
 * Verteilt `sitzeGesamt` Sitze auf die Wahlvorschläge aller Wahlbereiche.
 *
 * Bei einem Wahlbereich greift § 36, bei mehreren § 37 — die Schritte sind
 * dieselben, nur dass die Zwischenverteilung auf Wahlbereiche (§ 37 Abs. 3)
 * und der Überhang-Übertrag (§ 37 Abs. 5) dann nichttrivial werden.
 */
export function verteileSitze(bereiche: Wahlbereich[], sitzeGesamt: number): Sitzverteilung {
	const losentscheide: string[] = [];
	const mehrereWahlbereiche = bereiche.length > 1;

	// § 37 Abs. 1: Gesamtstimmenzahl je Partei über alle Wahlbereiche.
	const stimmenJePartei = new Map<string, number>();
	const meta = new Map<string, { lang?: string; farbe?: string }>();
	for (const b of bereiche) {
		for (const v of b.vorschlaege) {
			stimmenJePartei.set(v.partei, (stimmenJePartei.get(v.partei) ?? 0) + gesamtstimmen(v));
			if (!meta.has(v.partei)) meta.set(v.partei, { lang: v.parteiLang, farbe: v.farbe });
		}
	}
	const gueltigeStimmen = [...stimmenJePartei.values()].reduce((s, v) => s + v, 0);

	// § 37 Abs. 2 i. V. m. § 36 Abs. 2 und 3.
	let verteilung = hareNiemeyer(stimmenJePartei, sitzeGesamt);
	verteilung = mitMehrheitsklausel(stimmenJePartei, sitzeGesamt, verteilung);
	if (verteilung.losentscheid) {
		losentscheide.push(
			'Losentscheid bei der Sitzverteilung auf die Wahlvorschläge (§ 36 Abs. 2 S. 5)'
		);
	}

	const sitze: Sitz[] = [];

	for (const [partei, parteiSitze] of verteilung.zuteilung) {
		if (parteiSitze <= 0) continue;
		const m = meta.get(partei) ?? {};

		// § 37 Abs. 3: Sitze der Partei auf ihre Wahlbereichslisten verteilen.
		const jeBereich = new Map<string, number>();
		for (const b of bereiche) {
			const v = b.vorschlaege.find((x) => x.partei === partei);
			if (v) jeBereich.set(b.id, gesamtstimmen(v));
		}
		const bereichsSitze = hareNiemeyer(jeBereich, parteiSitze);
		if (bereichsSitze.losentscheid) {
			losentscheide.push(
				`${partei}: Losentscheid bei der Verteilung auf die Wahlbereiche (§ 37 Abs. 3)`
			);
		}

		// § 37 Abs. 4 i. V. m. § 36 Abs. 4 bis 6.
		let offen = 0;
		for (const b of bereiche) {
			const v = b.vorschlaege.find((x) => x.partei === partei);
			if (!v) continue;
			const n = bereichsSitze.zuteilung.get(b.id) ?? 0;
			const erg = verteileAufBewerber(v, b, n, mehrereWahlbereiche);
			sitze.push(...erg.sitze);
			offen += erg.offen;
			losentscheide.push(...erg.losentscheide);
		}

		// § 37 Abs. 5: Was in einem Wahlbereich nicht besetzt werden konnte, geht
		// an die Bewerber derselben Partei in den anderen Wahlbereichen — in der
		// Reihenfolge der höchsten Stimmenzahlen.
		if (offen > 0) {
			const bereitsGewaehlt = new Set(
				sitze.filter((s) => s.partei === partei && s.name).map((s) => `${s.wahlbereich}|${s.name}`)
			);
			const uebrige: { k: Kandidat; bereich: Wahlbereich }[] = [];
			for (const b of bereiche) {
				const v = b.vorschlaege.find((x) => x.partei === partei);
				if (!v) continue;
				for (const k of v.kandidaten) {
					const schluessel = `${mehrereWahlbereiche ? b.name : undefined}|${k.name}`;
					if (!bereitsGewaehlt.has(schluessel)) uebrige.push({ k, bereich: b });
				}
			}
			uebrige.sort((a, b) => b.k.stimmen - a.k.stimmen || a.k.listenplatz - b.k.listenplatz);
			if (
				offen > 0 &&
				offen < uebrige.length &&
				uebrige[offen - 1].k.stimmen === uebrige[offen].k.stimmen
			) {
				losentscheide.push(
					`${partei}: Stimmengleichheit beim Übertrag in andere Wahlbereiche (§ 37 Abs. 5 S. 3)`
				);
			}
			for (let i = 0; i < offen && i < uebrige.length; i++) {
				const { k, bereich } = uebrige[i];
				sitze.push({
					partei,
					parteiLang: m.lang,
					farbe: m.farbe,
					wahlbereich: mehrereWahlbereiche ? bereich.name : undefined,
					name: k.name,
					stimmen: k.stimmen,
					listenplatz: k.listenplatz,
					art: 'uebertrag',
					mandat: 'Übertrag aus anderem Wahlbereich'
				});
			}
			offen = Math.max(0, offen - uebrige.length);
		}

		// § 36 Abs. 7: Was jetzt noch offen ist, bleibt bis zum Ablauf der
		// Wahlperiode unbesetzt.
		for (let i = 0; i < offen; i++) {
			sitze.push({
				partei,
				parteiLang: m.lang,
				farbe: m.farbe,
				art: 'unbesetzt',
				mandat: 'unbesetzt',
				unbesetzt: true,
				grund: '§ 36 Abs. 7 NKWG — Wahlvorschlag hat weniger Bewerber als Sitze'
			});
		}
	}

	const parteien: ParteiErgebnis[] = [...stimmenJePartei.entries()]
		.map(([partei, stimmen]) => ({
			partei,
			parteiLang: meta.get(partei)?.lang,
			farbe: meta.get(partei)?.farbe,
			stimmen,
			prozent: gueltigeStimmen > 0 ? (stimmen / gueltigeStimmen) * 100 : 0,
			sitze: verteilung.zuteilung.get(partei) ?? 0
		}))
		.sort((a, b) => b.sitze - a.sitze || b.stimmen - a.stimmen);

	// Sitze nach Parteistärke gruppieren, damit das Sitzdiagramm zusammenhängende
	// Blöcke zeigt; innerhalb einer Partei kommen unbesetzte Plätze zuletzt.
	const rang = new Map(parteien.map((p, i) => [p.partei, i]));
	sitze.sort(
		(a, b) =>
			(rang.get(a.partei) ?? 0) - (rang.get(b.partei) ?? 0) ||
			Number(a.unbesetzt ?? false) - Number(b.unbesetzt ?? false) ||
			(b.stimmen ?? 0) - (a.stimmen ?? 0)
	);

	return { sitzeGesamt, gueltigeStimmen, parteien, sitze, losentscheide };
}

// ---------------------------------------------------------------------------
// § 45g — Direktwahl
// ---------------------------------------------------------------------------

export interface DirektBewerber {
	name: string;
	partei?: string;
	farbe?: string;
	stimmen: number;
}

export interface Direktergebnis {
	bewerber: (DirektBewerber & { prozent: number })[];
	gueltigeStimmen: number;
	/** Gewählt, wenn jemand mehr als die Hälfte der gültigen Stimmen hat. */
	gewaehlt?: DirektBewerber;
	/** Sonst die beiden Bestplatzierten für die Stichwahl. */
	stichwahl?: DirektBewerber[];
	losentscheid?: string;
}

/**
 * § 45g: Gewählt ist, wer mehr als die Hälfte der gültigen Stimmen erhält.
 * Sonst Stichwahl zwischen den beiden Bestplatzierten.
 */
export function direktwahl(bewerber: DirektBewerber[]): Direktergebnis {
	const gueltigeStimmen = bewerber.reduce((s, b) => s + b.stimmen, 0);
	const sortiert = [...bewerber].sort((a, b) => b.stimmen - a.stimmen);
	const mitProzent = sortiert.map((b) => ({
		...b,
		prozent: gueltigeStimmen > 0 ? (b.stimmen / gueltigeStimmen) * 100 : 0
	}));
	const erg: Direktergebnis = { bewerber: mitProzent, gueltigeStimmen };
	if (gueltigeStimmen <= 0 || sortiert.length === 0) return erg;

	if (sortiert[0].stimmen * 2 > gueltigeStimmen) {
		erg.gewaehlt = sortiert[0];
		return erg;
	}
	erg.stichwahl = sortiert.slice(0, 2);
	// Gleichstand um den zweiten Stichwahlplatz: das Gesetz lässt losen.
	if (sortiert.length > 2 && sortiert[1].stimmen === sortiert[2].stimmen) {
		erg.losentscheid = `Stimmengleichheit um den zweiten Stichwahlplatz zwischen ${sortiert[1].name} und ${sortiert[2].name}`;
	}
	return erg;
}
