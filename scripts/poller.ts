import { createServer } from 'node:http';
import { db, erstellePollerSpeicher, pollerSperre, schliesseDb } from '../src/lib/server/db.ts';
import { konfiguration } from '../src/lib/server/poller/config.ts';
import { Poller } from '../src/lib/server/poller/index.ts';

const einmalig = process.argv.includes('--once') || process.argv.includes('--einmalig');
const bisLeer = process.argv.includes('--bis-leer');
const probePruefen = process.argv.includes('--probe-pruefen');
const jetztArgument = process.argv.find((x) => x.startsWith('--jetzt='))?.slice(8);
const argument = (name: string) => process.argv.find((x) => x.startsWith(`--${name}=`))?.split('=', 2)[1];
const config = konfiguration({
	...process.env,
	POLLER_REGIONEN: argument('regionen') ?? process.env.POLLER_REGIONEN,
	POLLER_WAHLTAGE: argument('wahltage') ?? process.env.POLLER_WAHLTAGE,
	BACKFILL_ENABLED: bisLeer ? 'true' : process.env.BACKFILL_ENABLED
});
const poller = new Poller(await erstellePollerSpeicher({
	wahltage: config.wahltage,
	regionen: config.regionen,
	sofort: Boolean(config.regionen?.length)
}), config);
const freigeben = await pollerSperre();
let durchlaeufe = 0;
let aufgaben = 0;
let letzteAnzahl = 0;
const server = createServer((req, res) => {
	if (req.url !== '/metrics') { res.writeHead(404).end(); return; }
	res.setHeader('content-type', 'text/plain; version=0.0.4');
	res.end(`# TYPE votemanager_poller_runs_total counter\nvotemanager_poller_runs_total ${durchlaeufe}\n# TYPE votemanager_poller_tasks_total counter\nvotemanager_poller_tasks_total ${aufgaben}\n`);
}).listen(Number(process.env.METRICS_PORT ?? 9090));

try {
	do {
		const anzahl = letzteAnzahl = await poller.einmal(jetztArgument ? new Date(jetztArgument) : new Date());
		durchlaeufe++;
		aufgaben += anzahl;
		if (!einmalig && !(bisLeer && anzahl === 0)) await new Promise((resolve) => setTimeout(resolve, anzahl ? 1_000 : 10_000));
	} while (!einmalig && !(bisLeer && letzteAnzahl === 0));
	if (probePruefen) {
		const sql = db();
		const vorher = await sql<Array<{ dokumente: number }>>`SELECT count(*)::int dokumente FROM dokument`;
		const regionen = config.regionen ?? [];
		const wahltage = config.wahltage ?? [];
		const abdeckung = await sql<Array<{ region: string; wahltag: string }>>`
			SELECT DISTINCT b.regionalschluessel region, to_char(t.datum, 'YYYYMMDD') wahltag
			FROM behoerde b JOIN instanz i ON i.behoerde_id=b.id JOIN termin t ON t.instanz_id=i.id
			JOIN wahl w ON w.termin_id=t.id
			WHERE b.regionalschluessel IN ${sql(regionen)} AND to_char(t.datum, 'YYYYMMDD') IN ${sql(wahltage)}`;
		if (regionen.some((r) => !abdeckung.some((a) => a.region === r)) || wahltage.some((w) => !abdeckung.some((a) => a.wahltag === w))) {
			throw new Error(`Probe unvollständig: ${JSON.stringify(abdeckung)}`);
		}
		await sql`UPDATE pfad_stand p SET naechste_pruefung=now()
			FROM instanz i JOIN behoerde b ON b.id=i.behoerde_id
			WHERE p.instanz_id=i.id AND b.regionalschluessel IN ${sql(regionen)}`;
		do {
			letzteAnzahl = await poller.einmal(new Date());
			durchlaeufe++;
			aufgaben += letzteAnzahl;
			if (letzteAnzahl) await new Promise((resolve) => setTimeout(resolve, 1_000));
		} while (letzteAnzahl);
		const [nachher] = await sql<Array<{ dokumente: number; unveraendert: number }>>`
			SELECT (SELECT count(*)::int FROM dokument) dokumente,
				(SELECT count(*)::int FROM pfad_stand WHERE status=304) unveraendert`;
		if (nachher.unveraendert === 0 && nachher.dokumente !== vorher[0].dokumente) {
			throw new Error('Weder 304-Antwort noch vollständige Hash-Deduplizierung im zweiten Lauf');
		}
		console.log(`Probe erfolgreich: ${nachher.dokumente} Dokumente, ${nachher.unveraendert} unveränderte Pfade`);
	}
} finally {
	server.close();
	await freigeben();
	await schliesseDb();
}
