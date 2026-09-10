const start = Date.now();
const zaehler = new Map<string, number>();

/**
 * Zähler, wenn der Name auf `_total` endet, sonst Gauge — dann auch mit
 * negativem `um`. Labels werden Teil des Schlüssels; deshalb nur Werte mit
 * begrenzter Vielfalt übergeben (Routen-ID, nie die URL).
 */
export function zaehle(name: string, um = 1, labels?: Record<string, string>): void {
	const schluessel = labels
		? `${name}{${Object.entries(labels).map(([k, v]) => `${k}="${maskiere(v)}"`).join(',')}}`
		: name;
	zaehler.set(schluessel, (zaehler.get(schluessel) ?? 0) + um);
}

/** Prometheus-Textformat: `\`, `"` und Zeilenumbruch sind im Labelwert zu maskieren. */
const maskiere = (wert: string) => wert.replace(/[\\"\n]/g, (z) => (z === '\n' ? '\\n' : `\\${z}`));

export function metriken(): string {
	// Nach Grundname gruppiert: das Format verlangt alle Zeilen einer Metrik
	// zusammenhängend unter genau einer TYPE-Zeile.
	const familien = new Map<string, string[]>();
	for (const [schluessel, wert] of zaehler) {
		const name = schluessel.split('{', 1)[0];
		familien.set(name, [...(familien.get(name) ?? []), `votemanager_${schluessel} ${wert}`]);
	}
	return [
		'# TYPE votemanager_process_uptime_seconds gauge',
		`votemanager_process_uptime_seconds ${Math.floor((Date.now() - start) / 1000)}`,
		...[...familien].flatMap(([name, zeilen]) => [
			`# TYPE votemanager_${name} ${name.endsWith('_total') ? 'counter' : 'gauge'}`,
			...zeilen
		])
	].join('\n') + '\n';
}
