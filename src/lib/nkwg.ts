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

import { zuteilen, HARE_NIEMEYER } from './wahlrecht/kern/zuteilung';
import { nimmGroesste, type Grenzfall } from './wahlrecht/kern/auswahl';

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

export interface Stimmenanteil {
	partei: string;
	parteiLang?: string;
	farbe?: string;
	stimmen: number;
	prozent: number;
}

export interface Stimmenverhaeltnis {
	/** Summe der Partei- und Bewerberstimmen; bei Kumulieren keine Wählerzahl. */
	stimmenGesamt: number;
	parteien: Stimmenanteil[];
}

export interface Sitzverteilung {
	sitzeGesamt: number;
	gueltigeStimmen: number;
	parteien: ParteiErgebnis[];
	sitze: Sitz[];
	/** Stellen, an denen das Gesetz einen Losentscheid vorsieht (§ 36 Abs. 2 S. 5 u. a.). */
	losentscheide: string[];
	losfaelle: Losfall[];
}

export interface Losfall {
	kontext: string;
	betroffene: string[];
	sitze: number;
	/** Rechnerisch vorläufig ausgewählt; die tatsächliche Auswahl trifft das Los. */
	vorlaeufig: string[];
	rechtsgrundlage: string;
	text: string;
}

// ---------------------------------------------------------------------------
// Hare/Niemeyer — § 36 Abs. 2 Sätze 2 bis 5
// ---------------------------------------------------------------------------

export interface HareErgebnis<K> {
	zuteilung: Map<K, number>;
	/** true, wenn an der Zuteilungsgrenze gleiche Zahlenbruchteile stehen. */
	losentscheid: boolean;
	grenzfall?: Grenzfall<K>;
}

/**
 * Hare/Niemeyer mit exakter Ganzzahlarithmetik.
 *
 * Bewusst BigInt statt Gleitkomma: bei knappen Zahlenbruchteilen würde ein
 * Rundungsfehler sonst über ein Mandat entscheiden.
 *
 * Die Arithmetik liegt inzwischen in `wahlrecht/kern/zuteilung` — dort teilen
 * sich Quote- und Divisorverfahren dasselbe Auswahl-Primitiv. Diese Funktion
 * bleibt als niedersächsische Sicht darauf bestehen: § 36 Abs. 2 NKWG kennt nur
 * Hare/Niemeyer, und `losentscheid` ist genau Satz 5.
 */
export function hareNiemeyer<K>(stimmen: Map<K, number>, sitze: number): HareErgebnis<K> {
	const erg = zuteilen(stimmen, sitze, HARE_NIEMEYER);
	return { zuteilung: erg.sitze, losentscheid: erg.grenzfall !== undefined, grenzfall: erg.grenzfall };
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Gesamtstimmenzahl eines Wahlvorschlags: Liste + alle Bewerber (§ 35 Nr. 4). */
export function gesamtstimmen(v: Wahlvorschlag): number {
	return v.listenstimmen + v.kandidaten.reduce((s, k) => s + k.stimmen, 0);
}

/** Partei-/Listensummen über alle Wahlbereiche, unabhängig von einer Sitzverteilung. */
export function stimmenverhaeltnis(bereiche: Wahlbereich[]): Stimmenverhaeltnis {
	const summen = new Map<string, { parteiLang?: string; farbe?: string; stimmen: number }>();
	for (const { vorschlaege } of bereiche) {
		for (const v of vorschlaege) {
			const bisher = summen.get(v.partei);
			summen.set(v.partei, {
				parteiLang: bisher?.parteiLang ?? v.parteiLang,
				farbe: bisher?.farbe ?? v.farbe,
				stimmen: (bisher?.stimmen ?? 0) + gesamtstimmen(v)
			});
		}
	}
	const stimmenGesamt = [...summen.values()].reduce((summe, partei) => summe + partei.stimmen, 0);
	const parteien = [...summen.entries()]
		.map(([partei, wert]) => ({
			partei,
			...wert,
			prozent: stimmenGesamt > 0 ? (wert.stimmen / stimmenGesamt) * 100 : 0
		}))
		.sort((a, b) => b.stimmen - a.stimmen);
	return { stimmenGesamt, parteien };
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
	const auswahl = nimmGroesste(reste, (a, b) => (a.rest < b.rest ? -1 : a.rest > b.rest ? 1 : 0), offen);
	for (const rest of auswahl.gewaehlt) zuteilung.set(rest.k, zuteilung.get(rest.k)! + 1);
	const grenzfall = auswahl.grenzfall && {
		betroffene: auswahl.grenzfall.betroffene.map((rest) => rest.k),
		sitze: auswahl.grenzfall.sitze
	};
	return { zuteilung, losentscheid: grenzfall !== undefined, grenzfall };
}

// ---------------------------------------------------------------------------
// § 36 Abs. 4 bis 6 — Zuteilung innerhalb eines Wahlvorschlags
// ---------------------------------------------------------------------------

interface BewerberErgebnis {
	sitze: Sitz[];
	/** Sitze, die mangels Bewerbern nicht besetzt werden konnten. */
	offen: number;
	losentscheide: string[];
	losfaelle: Losfall[];
}

function verteileAufBewerber(
	v: Wahlvorschlag,
	bereich: Wahlbereich,
	anzahl: number,
	mehrereWahlbereiche: boolean
): BewerberErgebnis {
	const sitze: Sitz[] = [];
	const losentscheide: string[] = [];
	const losfaelle: Losfall[] = [];
	if (anzahl <= 0) return { sitze, offen: 0, losentscheide, losfaelle };

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
		if (!k) return { sitze, offen: anzahl, losentscheide, losfaelle };
		sitze.push(basis(k, 'personenwahl', 'Einzelwahlvorschlag'));
		return { sitze, offen: anzahl - 1, losentscheide, losfaelle };
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
		// 'liste' und 'kandidaten' sind die Schlüssel der Zuteilungs-Map. Weil die
		// Beteiligten eines Losfalls angezeigt werden, hier auf die Bezeichnungen
		// des Gesetzes bringen — § 36 Abs. 4 stellt die Liste der Gesamtheit der
		// Bewerber mit Stimmen gegenüber.
		const beteiligte = (aufteilung.grenzfall?.betroffene ?? []).map((k) =>
			k === 'liste' ? 'Liste' : 'Bewerber mit Stimmen'
		);
		meldeLosfall(losfaelle, losentscheide, {
			kontext: `${v.partei}${wahlbereich ? ` (${wahlbereich})` : ''}: Liste oder Bewerber`,
			betroffene: beteiligte,
			sitze: aufteilung.grenzfall?.sitze ?? 0,
			vorlaeufig: beteiligte.slice(0, aufteilung.grenzfall?.sitze ?? 0),
			rechtsgrundlage: '§ 36 Abs. 4 NKWG',
			text: `${v.partei}${wahlbereich ? ` (${wahlbereich})` : ''}: Losentscheid bei der Aufteilung zwischen Liste und Bewerbern (§ 36 Abs. 4)`
		});
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
	const personenAuswahl = nimmGroesste(mitStimmen, (a, b) => a.stimmen < b.stimmen ? -1 : a.stimmen > b.stimmen ? 1 : 0, personenSitze);
	const nachStimmen = [...personenAuswahl.gewaehlt, ...mitStimmen.filter((k) => !personenAuswahl.gewaehlt.includes(k))];
	if (personenAuswahl.grenzfall) {
		// Satz 4: Bei Stimmengleichheit entscheidet das Los.
		const namen = personenAuswahl.grenzfall.betroffene.map((k) => k.name);
		meldeLosfall(losfaelle, losentscheide, {
			kontext: `${v.partei}${wahlbereich ? ` (${wahlbereich})` : ''}: Personenmandate`,
			betroffene: namen,
			sitze: personenAuswahl.grenzfall.sitze,
			vorlaeufig: namen.slice(0, personenAuswahl.grenzfall.sitze),
			rechtsgrundlage: '§ 36 Abs. 5 S. 4 NKWG',
			text: `${v.partei}${wahlbereich ? ` (${wahlbereich})` : ''}: Stimmengleichheit an der Mandatsgrenze zwischen ${namen.join(' und ')} (§ 36 Abs. 5 S. 4)`
		});
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

	return { sitze, offen, losentscheide, losfaelle };
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
	const losfaelle: Losfall[] = [];
	const mehrereWahlbereiche = bereiche.length > 1;

	// § 37 Abs. 1: Gesamtstimmenzahl je Partei über alle Wahlbereiche.
	const stimmen = stimmenverhaeltnis(bereiche);
	const stimmenJePartei = new Map(stimmen.parteien.map((p) => [p.partei, p.stimmen]));
	const meta = new Map<string, { lang?: string; farbe?: string }>(
		stimmen.parteien.map((p) => [p.partei, { lang: p.parteiLang, farbe: p.farbe }])
	);
	const gueltigeStimmen = stimmen.stimmenGesamt;

	// § 37 Abs. 2 i. V. m. § 36 Abs. 2 und 3.
	let verteilung = hareNiemeyer(stimmenJePartei, sitzeGesamt);
	verteilung = mitMehrheitsklausel(stimmenJePartei, sitzeGesamt, verteilung);
	if (verteilung.losentscheid) {
		const betroffene = verteilung.grenzfall?.betroffene ?? [];
		meldeLosfall(losfaelle, losentscheide, {
			kontext: 'Sitzverteilung auf die Wahlvorschläge', betroffene,
			sitze: verteilung.grenzfall?.sitze ?? 0, vorlaeufig: betroffene.slice(0, verteilung.grenzfall?.sitze ?? 0),
			rechtsgrundlage: '§ 36 Abs. 2 S. 5 NKWG',
			text: 'Losentscheid bei der Sitzverteilung auf die Wahlvorschläge (§ 36 Abs. 2 S. 5)'
		});
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
			// Die Zuteilung läuft über `b.id`; angezeigt wird der Wahlbereichsname.
			const betroffene = (bereichsSitze.grenzfall?.betroffene ?? []).map(
				(id) => bereiche.find((b) => b.id === id)?.name ?? id
			);
			meldeLosfall(losfaelle, losentscheide, {
				kontext: `${partei}: Verteilung auf die Wahlbereiche`, betroffene,
				sitze: bereichsSitze.grenzfall?.sitze ?? 0, vorlaeufig: betroffene.slice(0, bereichsSitze.grenzfall?.sitze ?? 0),
				rechtsgrundlage: '§ 37 Abs. 3 NKWG', text: `${partei}: Losentscheid bei der Verteilung auf die Wahlbereiche (§ 37 Abs. 3)`
			});
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
			losfaelle.push(...erg.losfaelle);
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
			const uebertrag = nimmGroesste(uebrige, (a, b) => a.k.stimmen < b.k.stimmen ? -1 : a.k.stimmen > b.k.stimmen ? 1 : 0, offen);
			if (uebertrag.grenzfall) {
				const kennungen = uebertrag.grenzfall.betroffene.map(({ k, bereich }) => `${bereich.name}: ${k.name}`);
				meldeLosfall(losfaelle, losentscheide, {
					kontext: `${partei}: Übertrag in andere Wahlbereiche`, betroffene: kennungen,
					sitze: uebertrag.grenzfall.sitze, vorlaeufig: kennungen.slice(0, uebertrag.grenzfall.sitze),
					rechtsgrundlage: '§ 37 Abs. 5 S. 3 NKWG', text: `${partei}: Stimmengleichheit beim Übertrag in andere Wahlbereiche (§ 37 Abs. 5 S. 3)`
				});
			}
			for (const { k, bereich } of uebertrag.gewaehlt) {
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

	const parteien: ParteiErgebnis[] = stimmen.parteien
		.map((partei) => ({
			...partei,
			sitze: verteilung.zuteilung.get(partei.partei) ?? 0
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

	return { sitzeGesamt, gueltigeStimmen, parteien, sitze, losentscheide, losfaelle };
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
	losfall?: Losfall;
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
	const auswahl = nimmGroesste(sortiert, (a, b) => a.stimmen < b.stimmen ? -1 : a.stimmen > b.stimmen ? 1 : 0, 2);
	erg.stichwahl = auswahl.gewaehlt;
	// Gleichstand um den zweiten Stichwahlplatz: das Gesetz lässt losen.
	if (auswahl.grenzfall) {
		const betroffene = auswahl.grenzfall.betroffene.map((b) => b.name);
		erg.losentscheid = `Stimmengleichheit um den zweiten Stichwahlplatz zwischen ${betroffene.join(' und ')}`;
		erg.losfall = {
			kontext: 'Zweiter Stichwahlplatz', betroffene, sitze: auswahl.grenzfall.sitze,
			vorlaeufig: betroffene.slice(0, auswahl.grenzfall.sitze), rechtsgrundlage: '§ 45g Abs. 2 NKWG',
			text: erg.losentscheid
		};
	}
	return erg;
}

function meldeLosfall(losfaelle: Losfall[], texte: string[], losfall: Losfall): void {
	losfaelle.push(losfall);
	texte.push(losfall.text);
}
