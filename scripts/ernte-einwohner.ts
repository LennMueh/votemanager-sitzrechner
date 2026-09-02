/**
 * Einwohnerzahlen für § 46 NKomVG aus LSN-Online holen und einfrieren.
 *
 * Aufruf:  npm run einwohner -- --stichtag=20250630
 *          npm run einwohner -- --stichtag=20200630 --ziel=einwohner-ni-2021.json
 *
 * Warum überhaupt: die Zahl der Abgeordneten steht nicht im Feed. Sie folgt aus
 * § 46 NKomVG nach der Einwohnerzahl, und § 177 Abs. 2 Satz 1 NKomVG bestimmt,
 * welche gilt — die der Landesstatistikbehörde zu einem Stichtag 12 bis 18 Monate
 * vor dem Wahltag. Für den 13.09.2026 ist das landesweit der 30.06.2025.
 *
 * Warum ein Browser: LSN-Online (Tabelle A100001G aus der Erhebung 12411) ist eine
 * sitzungsgebundene Anwendung ohne API. Die frei herunterladbaren xlsx-Dateien des
 * LSN helfen nicht — sie enden beim 30.09.2024, stehen noch auf Zensus-2011-Basis
 * und kennen keine Samtgemeinden. Chrome kommt aus dem Puppeteer-Cache, denselben
 * nutzt `npm run schuss`.
 *
 * Warum einfrieren statt zur Laufzeit abrufen: der Stichtag ändert sich einmal je
 * Wahlperiode. Am Wahlabend darf nichts an einem fremden Dienst hängen, und die
 * Zahlen sollen im Diff nachprüfbar sein. Ein Lauf, drei Seitenabrufe.
 *
 * Ein falscher Stichtag ist kein Schönheitsfehler: der Flecken Bardowick hatte am
 * 30.06.2024 noch 7.126 Einwohner und damit 21 Sitze, zum 30.06.2025 sind es 6.580
 * und damit 19. Deshalb prüft das Skript den Stichtag gegen die Maske.
 */
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import puppeteer from 'puppeteer-core';

const CHROME = `${homedir()}/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome`;
const WURZEL = 'https://www1.nls.niedersachsen.de/statistik/default.asp';
const TABELLE = 'A100001G';

const argument = (name: string) => process.argv.find((x) => x.startsWith(`--${name}=`))?.split('=', 2)[1];
const stichtag = argument('stichtag');
const zielName = argument('ziel') ?? 'einwohner-ni.json';
if (!stichtag || !/^\d{4}(03|06|09|12)\d{2}$/.test(stichtag)) {
	throw new Error('Aufruf: npm run einwohner -- --stichtag=YYYYMMDD (Quartalsende)');
}
/** LSN kennt Zeitpunkte als YYYYMM. */
const zeit = stichtag.slice(0, 6);
const tag = `${stichtag.slice(6, 8)}.${stichtag.slice(4, 6)}.${stichtag.slice(0, 4)}`;

/**
 * Die drei Ebenen, die § 46 braucht. `neuEbene()` ist die Funktion der Maske:
 * 1 Land, 2 Statistische Region, 3 Kreisfr. Stadt/Landkreis,
 * 4 Einheits-/Samtgemeinde, 5 Mitgliedsgemeinde.
 *
 * Ebene 4 und 5 sind beide nötig: eine Samtgemeinde ist keine Summe, die man sich
 * sparen könnte — sie wählt einen eigenen Rat, und ihre Mitgliedsgemeinden wählen
 * eigene Räte mit dem Zuschlag aus § 46 Abs. 1 Satz 2.
 */
const EBENEN = [3, 4, 5] as const;
const warte = (ms: number) => new Promise((f) => setTimeout(f, ms));

const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const gebiete = new Map<string, { name: string; einwohner: number }>();

try {
	for (const ebene of EBENEN) {
		const seite = await browser.newPage();
		await seite.goto(WURZEL, { waitUntil: 'networkidle2', timeout: 60_000 });
		// „Es ist nicht erforderlich, sich anzumelden" — WEITER führt in die Datenbank.
		await seite.evaluate(() => (document.querySelector('input[name=LOGIN1][value=WEITER]') as HTMLInputElement).click());
		await warte(4000);

		const baum = () => seite.frames().find((f) => /haupt_neu/.test(f.url()))!;
		await baum().evaluate((t) => {
			const a = [...document.querySelectorAll('a')].find((x) => (x.getAttribute('href') ?? '').includes(`open_params('${t}'`));
			if (!a) throw new Error('Tabelle nicht im Auswahlbaum gefunden');
			a.click();
		}, TABELLE);
		await warte(6000);

		const maske = () => seite.frames().find((f) => /param_haupt/.test(f.url()))!;
		await maske().evaluate((e) => (globalThis as never as { neuEbene(n: number): void }).neuEbene(e), ebene);
		await warte(9000);

		const anzahl = await maske().evaluate((z) => {
			const treffer = [...document.querySelectorAll('input[name=ZEIT]')].find((x) => (x as HTMLInputElement).value.startsWith(z)) as HTMLInputElement | undefined;
			if (!treffer) throw new Error('Stichtag steht in der Maske nicht zur Auswahl');
			treffer.checked = true;
			const ug = [...document.querySelectorAll('input[name=UG]')] as HTMLInputElement[];
			for (const kasten of ug) kasten.checked = true;
			return ug.length;
		}, zeit);

		await baum().evaluate(() => {
			const knopf = [...document.querySelectorAll('a,input,button')].find((x) => /Tabelle erstellen/i.test((x as HTMLElement).innerText || (x as HTMLInputElement).value || ''));
			(knopf as HTMLElement).click();
		});
		await warte(20_000);

		// Das Ergebnis liegt in einem eigenen Frame mit erzeugtem Dateinamen.
		const ergebnis = seite.frames().find((f) => /_0000/.test(f.url()));
		if (!ergebnis) throw new Error(`Ebene ${ebene}: keine Ergebnistabelle (${anzahl} Gebiete gewählt)`);

		const { kopf, zeilen } = await ergebnis.evaluate(() => ({
			kopf: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
			zeilen: [...document.querySelectorAll('table tr')].map((tr) =>
				[...tr.querySelectorAll('th,td')].map((td) => (td as HTMLElement).innerText.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()))
		}));
		// Gegenprobe: die erzeugte Tabelle muss den verlangten Stichtag nennen.
		if (!kopf.includes(tag)) throw new Error(`Ebene ${ebene}: die Tabelle nennt nicht den Stichtag ${tag}`);

		let neu = 0;
		for (const zeile of zeilen) {
			// Erste Spalte ist „<AGS> <Name>", zweite die Bevölkerung.
			const treffer = /^(\d{1,6})\s+(.+)$/.exec(zeile[0] ?? '');
			const einwohner = Number((zeile[1] ?? '').replace(/[.\s]/g, ''));
			if (!treffer || !Number.isFinite(einwohner) || einwohner <= 0) continue;
			const [, ags, name] = treffer;
			// Statistische Regionen und das Land tragen ein- bis zweistellige
			// Schlüssel und sind keine Kommunen.
			if (ags.length < 3) continue;
			if (!gebiete.has(`03${ags}`)) neu++;
			gebiete.set(`03${ags}`, { name: name.replace(/\s*,\s*/, ', '), einwohner });
		}
		console.log(`Ebene ${ebene}: ${anzahl} Gebiete gewählt, ${neu} neue Schlüssel`);
		await seite.close();
	}
} finally {
	await browser.close();
}

// Lieber gar keine Datei als eine halbe: eine unvollständige Einwohnertabelle
// ließe § 46 stillschweigend auf die Vorwahl zurückfallen, statt aufzufallen.
const kreise = [...gebiete.keys()].filter((k) => k.length === 5).length;
const verbaende = [...gebiete.keys()].filter((k) => k.length === 8 && k[5] === '4').length;
const gemeinden = gebiete.size - kreise - verbaende;
if (kreise < 40 || verbaende < 100 || gemeinden < 900) {
	throw new Error(`Zu wenig geerntet: ${kreise} Kreise, ${verbaende} Samtgemeinden, ${gemeinden} Gemeinden.`);
}

const ziel = new URL(`../src/lib/wahlrecht/${zielName}`, import.meta.url);
writeFileSync(ziel, JSON.stringify({
	_stichtag: stichtag,
	_rechtsgrundlage: '§ 177 Abs. 2 Satz 1 NKomVG',
	_quelle: `LSN-Online, Tabelle ${TABELLE} (Erhebung 12411, Fortschreibung des Bevölkerungsstandes), abgerufen am ${new Date().toISOString().slice(0, 10)}`,
	_hinweis: 'Per npm run einwohner eingefroren. Zur Laufzeit wird nichts abgerufen. Schlüssel: 03 + amtlicher LSN-Schlüssel — fünfstellig Landkreis, achtstellig mit 4 an sechster Stelle Samtgemeinde, sonst Gemeinde.',
	gebiete: Object.fromEntries([...gebiete.entries()].sort(([a], [b]) => a.localeCompare(b)))
}, null, '\t') + '\n');
console.log(`${gebiete.size} Gebiete zum ${tag} (${kreise} Kreise, ${verbaende} Samtgemeinden, ${gemeinden} Gemeinden) → src/lib/wahlrecht/${zielName}`);
