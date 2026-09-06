/**
 * Die Ergebnistabelle der Wahllokale: welche Spalten, und welche Zahl je Zelle.
 *
 * Reine Funktion ohne I/O, wie `nkwg.ts` und `kalender.ts` — die Dokumente holt
 * `daten.ts` aus dem Archiv.
 *
 * Warum das nicht aus der Bezirksübersicht kommt: die kürzt auf die vier
 * stärksten Wahlvorschläge **der ganzen Wahl** plus „Sonstige". Für die
 * Gemeinde Handorf hieße das eine Spalte „WfB" für eine Wählergemeinschaft, die
 * dort nicht auf dem Stimmzettel stand, und eine Spalte „Sonstige", hinter der
 * sich die NPD verbirgt; beim Samtgemeinderat verdeckt dieselbe eine Spalte
 * drei Wahlvorschläge. Die Einzeldokumente der Wahllokale führen dagegen jeden
 * Wahlvorschlag, der dort wählbar war, und nur diese.
 */

import { stimmenverhaeltnis } from './nkwg';
import type { GebietsErgebnis } from './votemanager';

export interface Bezirksspalte {
	label: string;
	/** Parteifarbe des Hosts; Entitäts-Identität, keine Designfarbe. */
	farbe?: string;
}

export interface Bezirkszelle {
	absolut: number;
	/** 0 bis 1, bezogen auf alle Stimmen dieses Wahllokals. */
	anteil: number;
}

export interface Bezirksmatrix {
	spalten: Bezirksspalte[];
	/** Je Wahllokal-ID eine Zahl pro Spalte. Fehlt das Dokument, fehlt der Eintrag. */
	zeilen: Record<string, Bezirkszelle[]>;
}

/**
 * Spalten aus dem Gesamtergebnis des Gebiets, Zahlen aus den Wahllokalen.
 *
 * Die Spaltenfolge ist die des Gesamtergebnisses, also nach Stimmen absteigend
 * — dieselbe Ordnung, die `Stimmverhaeltnis.svelte` in seiner Legende zeigt.
 *
 * Der Spaltensatz ist die Vereinigung mit allem, was in einem Wahllokal
 * auftaucht. Normalerweise ändert das nichts (das Gesamtergebnis *ist* die
 * Summe der Wahllokale); es ist die Absicherung dagegen, dass ein
 * Wahlvorschlag still aus der Tabelle fällt.
 *
 * Ein Wahllokal ohne Dokument bekommt **keine** Zeile, keine Nullen: dass dort
 * niemand gewählt hätte, wäre eine Aussage, die wir nicht haben.
 */
export function baueBezirksmatrix(
	gesamt: GebietsErgebnis,
	bezirke: { id: string; ergebnis?: GebietsErgebnis }[]
): Bezirksmatrix {
	const spalten: Bezirksspalte[] = [];
	const platz = new Map<string, number>();
	const aufnehmen = (partei: string, farbe?: string) => {
		if (platz.has(partei)) return;
		platz.set(partei, spalten.length);
		spalten.push({ label: partei, farbe });
	};

	for (const p of stimmenverhaeltnis([{ id: '', name: '', vorschlaege: gesamt.vorschlaege }]).parteien) {
		aufnehmen(p.partei, p.farbe);
	}

	const anteile = new Map<string, ReturnType<typeof stimmenverhaeltnis>>();
	for (const b of bezirke) {
		if (!b.ergebnis) continue;
		const v = stimmenverhaeltnis([{ id: b.id, name: '', vorschlaege: b.ergebnis.vorschlaege }]);
		anteile.set(b.id, v);
		for (const p of v.parteien) aufnehmen(p.partei, p.farbe);
	}

	const zeilen: Record<string, Bezirkszelle[]> = {};
	for (const [id, v] of anteile) {
		// Eine im Wahllokal fehlende Partei hat dort null Stimmen — das steht so
		// im Dokument des Hosts und ist keine Lücke.
		const zeile: Bezirkszelle[] = spalten.map(() => ({ absolut: 0, anteil: 0 }));
		for (const p of v.parteien) {
			zeile[platz.get(p.partei)!] = { absolut: p.stimmen, anteil: p.prozent / 100 };
		}
		zeilen[id] = zeile;
	}

	return { spalten, zeilen };
}
