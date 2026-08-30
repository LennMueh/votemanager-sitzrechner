/**
 * Verhältniswahl ohne getrennte Listenstimmen — der gemeinsame Fall außerhalb
 * Niedersachsens.
 *
 * Reine Rechenlogik, kein I/O. Zwei Schritte, beide Landesrecht nur in ihren
 * Parametern:
 *
 *   1. Sitze auf die Wahlvorschläge nach dem Verfahren des Landes.
 *   2. Sitze eines Wahlvorschlags auf seine Bewerber.
 *
 * Für Schritt 2 gibt es zwei Welten, und die amtlichen Endergebnisse im Archiv
 * sagen unmissverständlich, welche wo gilt:
 *
 *   - `stimmen`     — Hessen, Sachsen, Sachsen-Anhalt: die amtliche Liste der
 *                     Gewählten führt jede Zeile als „Personenwahl" mit
 *                     Stimmenzahl. Es entscheidet die Stimmenzahl der Bewerber.
 *   - `listenplatz` — Saarland („Gebietsliste 1"), Nordrhein-Westfalen
 *                     („Reservelistenplatz 1"): es entscheidet die Reihenfolge
 *                     auf dem Wahlvorschlag. Die veröffentlicht votemanager
 *                     während der Auszählung nicht — dort bleiben die Sitze
 *                     deshalb namenlos, statt eine Reihenfolge zu erfinden.
 *
 * § 36 Abs. 4 NKWG (nochmalige Teilung zwischen Liste und Bewerbern) hat hier
 * keine Entsprechung: eine getrennte Listenstimme gibt es in dieser Tabellenform
 * nicht — über alle 122.969 Bewerberzeilen im Archiv ist die Summe der
 * Bewerberstimmen exakt die Gesamtzahl des Wahlvorschlags.
 */

import {
	gesamtstimmen,
	stimmenverhaeltnis,
	type Losfall,
	type Sitz,
	type Sitzverteilung,
	type Wahlbereich,
	type Wahlvorschlag
} from '$lib/nkwg';
import { nimmGroesste } from './kern/auswahl';
import { zuteilen, type Verfahren } from './kern/zuteilung';

/** Wonach sich entscheidet, welche Bewerber eines Wahlvorschlags einziehen. */
export type Personenauswahl = 'stimmen' | 'listenplatz';

export interface Listenwahlrecht {
	verfahren: Verfahren;
	personen: Personenauswahl;
	/** Anteil in Prozent; die meisten Länder haben keine. */
	sperrklausel?: number;
	/** Für die Meldung von Losentscheiden, z. B. '§ 41 Abs. 1 S. 2 KWG SL'. */
	rechtsgrundlageZuteilung: string;
}

export function verteileListenwahl(
	bereiche: Wahlbereich[],
	sitzeGesamt: number,
	recht: Listenwahlrecht
): Sitzverteilung {
	const losentscheide: string[] = [];
	const losfaelle: Losfall[] = [];
	const melde = (losfall: Losfall) => {
		losfaelle.push(losfall);
		losentscheide.push(losfall.text);
	};

	const stimmen = stimmenverhaeltnis(bereiche);
	const gueltigeStimmen = stimmen.stimmenGesamt;

	// Sperrklausel vor der Zuteilung, nicht danach: sie nimmt am Verfahren gar
	// nicht erst teil. Keines der bislang umgesetzten Länder hat eine.
	const zugelassen = recht.sperrklausel
		? stimmen.parteien.filter((p) => p.prozent >= recht.sperrklausel!)
		: stimmen.parteien;

	const verteilung = zuteilen(
		new Map(zugelassen.map((p) => [p.partei, p.stimmen])),
		sitzeGesamt,
		recht.verfahren
	);

	if (verteilung.grenzfall) {
		// Bei Divisorverfahren kann dieselbe Liste mit mehreren Höchstzahlen an
		// der Kante stehen; für die Anzeige zählt nur, wer beteiligt ist.
		const betroffene = [...new Set(verteilung.grenzfall.betroffene)];
		melde({
			kontext: 'Sitzverteilung auf die Wahlvorschläge',
			betroffene,
			sitze: verteilung.grenzfall.sitze,
			vorlaeufig: betroffene.slice(0, verteilung.grenzfall.sitze),
			rechtsgrundlage: recht.rechtsgrundlageZuteilung,
			text: `Losentscheid bei der Sitzverteilung auf die Wahlvorschläge (${recht.rechtsgrundlageZuteilung})`
		});
	}

	const mehrereBereiche = bereiche.length > 1;
	const parteien = stimmen.parteien.map((p) => ({
		partei: p.partei,
		parteiLang: p.parteiLang,
		farbe: p.farbe,
		stimmen: p.stimmen,
		prozent: p.prozent,
		sitze: verteilung.sitze.get(p.partei) ?? 0
	}));

	const sitze: Sitz[] = [];
	for (const p of parteien) {
		if (p.sitze <= 0) continue;
		const basis = { partei: p.partei, parteiLang: p.parteiLang, farbe: p.farbe };

		// Bewerber über alle Wahlbereiche einsammeln, in Listenreihenfolge.
		const bewerber: { name: string; stimmen: number; listenplatz: number; bereich?: string }[] = [];
		for (const b of bereiche) {
			const v: Wahlvorschlag | undefined = b.vorschlaege.find((x) => x.partei === p.partei);
			for (const k of v?.kandidaten ?? []) {
				bewerber.push({ ...k, bereich: mehrereBereiche ? b.name : undefined });
			}
		}

		if (!bewerber.length) {
			// Listenreihenfolge unbekannt (oder gar keine Bewerber im Feed):
			// Sitze zählen, Personen offen lassen.
			for (let i = 0; i < p.sitze; i++) sitze.push({ ...basis, art: 'liste', mandat: 'Liste' });
			continue;
		}

		const auswahl =
			recht.personen === 'stimmen'
				? nimmGroesste(bewerber, (a, b) => (a.stimmen < b.stimmen ? -1 : a.stimmen > b.stimmen ? 1 : 0), p.sitze)
				: { gewaehlt: [...bewerber].sort((a, b) => a.listenplatz - b.listenplatz).slice(0, p.sitze), grenzfall: undefined };

		if (auswahl.grenzfall) {
			const betroffene = auswahl.grenzfall.betroffene.map((k) => k.name);
			melde({
				kontext: `${p.partei}: Sitze innerhalb des Wahlvorschlags`,
				betroffene,
				sitze: auswahl.grenzfall.sitze,
				vorlaeufig: betroffene.slice(0, auswahl.grenzfall.sitze),
				rechtsgrundlage: recht.rechtsgrundlageZuteilung,
				text: `${p.partei}: Stimmengleichheit zwischen Bewerbern um den letzten Sitz`
			});
		}

		for (const k of auswahl.gewaehlt) {
			sitze.push({
				...basis,
				name: k.name,
				stimmen: k.stimmen,
				listenplatz: k.listenplatz,
				wahlbereich: k.bereich,
				art: recht.personen === 'stimmen' ? 'personenwahl' : 'liste',
				mandat: recht.personen === 'stimmen' ? 'Personenwahl' : `Listenplatz ${k.listenplatz}`
			});
		}

		// Zu kurze Liste: die übrigen Sitze bleiben unbesetzt statt still zu
		// verschwinden. Invariante: Gewählte + Unbesetzte === Sitzzahl.
		for (let i = auswahl.gewaehlt.length; i < p.sitze; i++) {
			sitze.push({
				...basis,
				art: 'unbesetzt',
				mandat: 'unbesetzt',
				unbesetzt: true,
				grund: 'Der Wahlvorschlag hat weniger Bewerber als Sitze'
			});
		}
	}

	return {
		sitzeGesamt,
		gueltigeStimmen,
		parteien: parteien.sort((a, b) => b.sitze - a.sitze || b.stimmen - a.stimmen),
		sitze,
		losentscheide,
		losfaelle
	};
}

/** Nur für Tests und Diagnose: Gesamtstimmen eines Vorschlags, wie oben gerechnet. */
export { gesamtstimmen };
