/**
 * Geometrie des Halbkreis-Sitzdiagramms.
 *
 * Eigene Datei, damit die Ringaufteilung testbar ist — sie hat eine Invariante
 * (jeder Ring mindestens ein Platz, Summe genau die Sitzzahl), die still
 * kaputtgehen könnte.
 */

const R_INNEN = 0.42;
const R_AUSSEN = 1;

export interface Platz {
	/** Winkel im Bogenmaß, π (links) bis 0 (rechts). */
	winkel: number;
	/** Relativer Radius zwischen R_INNEN und R_AUSSEN. */
	r: number;
}

/** Radien der Ringe, von innen nach außen. */
export function ringRadien(anzahlRinge: number): number[] {
	return Array.from({ length: anzahlRinge }, (_, i) =>
		anzahlRinge === 1
			? (R_AUSSEN + R_INNEN) / 2
			: R_INNEN + ((R_AUSSEN - R_INNEN) * i) / (anzahlRinge - 1)
	);
}

/**
 * Verteilt `n` Sitze auf konzentrische Ringe, proportional zur Ringlänge.
 * Der Rundungsrest geht auf den innersten Ring — dort fällt eine Abweichung
 * von ein, zwei Plätzen optisch am wenigsten auf.
 */
export function ringVerteilung(n: number): number[] {
	if (n <= 0) return [];
	const ringe = Math.max(1, Math.min(5, Math.ceil(Math.sqrt(n / 3.2))));
	const radien = ringRadien(ringe);
	const summe = radien.reduce((s, r) => s + r, 0);
	const jeRing = radien.map((r) => Math.max(1, Math.floor((n * r) / summe)));
	jeRing[0] += n - jeRing.reduce((s, v) => s + v, 0);
	return jeRing;
}

/** Alle Plätze, sortiert von links nach rechts (dann von innen nach außen). */
export function plaetze(n: number): Platz[] {
	const jeRing = ringVerteilung(n);
	const radien = ringRadien(jeRing.length);
	const roh: Platz[] = [];
	radien.forEach((r, i) => {
		const anzahl = jeRing[i];
		for (let k = 0; k < anzahl; k++) {
			const t = anzahl === 1 ? 0.5 : k / (anzahl - 1);
			roh.push({ winkel: Math.PI - t * Math.PI, r });
		}
	});
	roh.sort((a, b) => b.winkel - a.winkel || a.r - b.r);
	return roh.slice(0, n);
}

/**
 * Punktradius, so dass sich benachbarte Plätze fast berühren, aber nicht
 * überlappen — in Umfangsrichtung wie in radialer Richtung.
 *
 * Bewusst rein proportional zur Bildgröße: eine feste Obergrenze in Pixeln
 * lässt die Punkte bei großen Darstellungen verloren wirken statt nach
 * Sitzverteilung auszusehen.
 */
export function punktRadius(bildRadius: number, n: number): number {
	const jeRing = ringVerteilung(n);
	const ringe = jeRing.length;
	const aussen = Math.max(1, jeRing[ringe - 1] ?? 1);

	// Abstand entlang des äußersten Rings (Halbkreis = π · r).
	const laengs = (Math.PI * bildRadius * R_AUSSEN) / Math.max(1, aussen - 1);
	// Abstand zwischen zwei Ringen.
	const quer =
		ringe > 1 ? ((R_AUSSEN - R_INNEN) * bildRadius) / (ringe - 1) : bildRadius * (R_AUSSEN - R_INNEN);

	return Math.max(2, 0.42 * Math.min(laengs, quer));
}
