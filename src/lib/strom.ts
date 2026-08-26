/** Eine native EventSource-Verbindung; der Server übernimmt Wiederverbindung und Replay. */
export function strom(schluessel: string[], aktualisieren: (schluessel?: string) => void): () => void {
	if (!schluessel.length) return () => {};
	const quellen: EventSource[] = [];
	for (let i = 0; i < schluessel.length; i += 50) {
		const quelle = new EventSource(`/api/strom?abo=${encodeURIComponent(schluessel.slice(i, i + 50).join(','))}`);
		quelle.addEventListener('update', (e) => aktualisieren(JSON.parse((e as MessageEvent).data).schluessel));
		quelle.addEventListener('reset', () => aktualisieren());
		quellen.push(quelle);
	}
	return () => quellen.forEach((quelle) => quelle.close());
}
