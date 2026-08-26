const start = Date.now();
const zaehler = new Map<string, number>();

export function zaehle(name: string, um = 1): void {
	zaehler.set(name, (zaehler.get(name) ?? 0) + um);
}

export function metriken(): string {
	return [
		'# TYPE votemanager_process_uptime_seconds gauge',
		`votemanager_process_uptime_seconds ${Math.floor((Date.now() - start) / 1000)}`,
		...([...zaehler].flatMap(([name, wert]) => [
			`# TYPE votemanager_${name} counter`,
			`votemanager_${name} ${wert}`
		]))
	].join('\n') + '\n';
}
