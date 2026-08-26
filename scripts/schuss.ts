/**
 * Nimmt den Präsentationsmodus auf, damit die Darstellung nicht nur behauptet,
 * sondern geprüft ist.
 *
 * Prüfkriterium ist maschinell: passt der Inhalt in die Seite (kein Überlauf)?
 * Das Bild dient dem Augenschein, die Zahl der Entscheidung.
 *
 * Aufruf:  node --experimental-strip-types scripts/schuss.ts [basisUrl] [zielordner]
 */

import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';

// Chrome liegt bereits im Puppeteer-Cache — kein Download nötig.
const CHROME = `${homedir()}/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome`;

const BASIS = process.argv[2] ?? 'http://localhost:5199';
const ZIEL = process.argv[3] ?? 'screenshots';
const WAHLTAG = '20210912';

const KREISTAG = '03355000:219:ebene_1_id_435';
const KREISWAHL_ADENDORF = '03355001:219:ebene_3_id_436';
const OEDEME = '03355022:225:ebene_8_id_1935';
const OB_WAHL = '03355022:223:ebene_3_id_438';
const OB_STICH = '03355022:224:ebene_3_id_438';

interface Fall {
	name: string;
	v: string;
	/** Wie oft nach rechts geblättert wird, um zur gewünschten Seite zu kommen. */
	seite: number;
	thema: 'hell' | 'dunkel';
	breite: number;
	hoehe: number;
}

const faelle: Fall[] = [];
for (const [breite, hoehe] of [
	[1920, 1080],
	[1280, 720]
] as const) {
	for (const thema of ['hell', 'dunkel'] as const) {
		faelle.push({ name: 'kreistag-uebersicht', v: KREISTAG, seite: 0, thema, breite, hoehe });
		faelle.push({ name: 'kreistag-stimmen', v: KREISTAG, seite: 1, thema, breite, hoehe });
		faelle.push({ name: 'kreistag-kacheln', v: KREISTAG, seite: 2, thema, breite, hoehe });
	}
	faelle.push({ name: 'kreiswahl-adendorf-stimmen', v: KREISWAHL_ADENDORF, seite: 0, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'oedeme-uebersicht', v: OEDEME, seite: 0, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'oedeme-kacheln', v: OEDEME, seite: 2, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'obwahl-stichwahl', v: OB_WAHL, seite: 0, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'obwahl-gewaehlt', v: OB_STICH, seite: 0, thema: 'dunkel', breite, hoehe });
}

// Auf dem Handy müssen alle Seitentypen nicht nur passen, sondern auch per
// Touch steuerbar bleiben.
for (const [breite, hoehe] of [[390, 844], [360, 640]] as const) {
	faelle.push({ name: 'kreistag-uebersicht-mobil', v: KREISTAG, seite: 0, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'kreistag-stimmen-mobil', v: KREISTAG, seite: 1, thema: 'dunkel', breite, hoehe });
	faelle.push({ name: 'kreistag-kacheln-mobil', v: KREISTAG, seite: 2, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'oedeme-uebersicht-mobil', v: OEDEME, seite: 0, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'obwahl-mobil', v: OB_WAHL, seite: 0, thema: 'dunkel', breite, hoehe });
}

await mkdir(ZIEL, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
let fehler = 0;

for (const f of faelle) {
	const seite = await browser.newPage();
	await seite.setViewport({ width: f.breite, height: f.hoehe });
	seite.on('pageerror', (e) => {
		console.log(`  ! JS-Fehler in ${f.name}: ${e.message}`);
		fehler++;
	});

	await seite.evaluateOnNewDocument((t: string) => localStorage.setItem('thema', t), f.thema);
	await seite.goto(`${BASIS}/praesentation?wahltag=${WAHLTAG}&v=${f.v}`, {
		// SSE bleibt absichtlich offen; auf Netzwerk-Leerlauf würde der Test ewig warten.
		waitUntil: 'domcontentloaded'
	});
	await seite.waitForSelector('.inhalt');
	// Rotation anhalten, damit die Aufnahme nicht mitten im Wechsel entsteht.
	await seite.keyboard.press(' ');
	if (f.breite <= 390) {
		const vorher = await seite.$eval('.steuerung .pause', (el) => el.textContent?.trim());
		await seite.click('.steuerung .pause');
		const nachher = await seite.$eval('.steuerung .pause', (el) => el.textContent?.trim());
		if (vorher === nachher) fehler++;
		await seite.click('.steuerung .pause');
	}
	for (let i = 0; i < f.seite; i++) await seite.keyboard.press('ArrowRight');
	await new Promise((r) => setTimeout(r, 1200));

	// Der eigentliche Test: bleibt Inhalt außerhalb der Seite?
	const mass = await seite.evaluate(() => {
		const el = document.querySelector('.inhalt') as HTMLElement | null;
		return el
			? {
					ueberlauf: el.scrollHeight - el.clientHeight,
					breitUeberlauf: el.scrollWidth - el.clientWidth,
					skala: getComputedStyle(el).getPropertyValue('--skala').trim(),
					seitenUeberlauf: document.documentElement.scrollHeight - window.innerHeight
				}
			: null;
	});

	const datei = `${ZIEL}/${f.breite}x${f.hoehe}-${f.name}-${f.thema}.png`;
	await seite.screenshot({ path: datei as `${string}.png` });

	const schlecht =
		!mass || mass.ueberlauf > 1 || mass.breitUeberlauf > 1 || mass.seitenUeberlauf > 1;
	if (schlecht) fehler++;
	console.log(
		`${schlecht ? 'FEHLT' : ' ok  '} ${f.breite}x${f.hoehe} ${f.name.padEnd(20)} ${f.thema.padEnd(7)}` +
			` skala=${mass?.skala ?? '?'} hoch=${mass?.ueberlauf ?? '?'} breit=${mass?.breitUeberlauf ?? '?'} seite=${mass?.seitenUeberlauf ?? '?'}`
	);

	await seite.close();
}

for (const f of [
	{ name: 'uebersicht-mobil', pfad: `/?wahltag=${WAHLTAG}`, ziel: '.gesamt', thema: 'hell', breite: 390, hoehe: 844 },
	{ name: 'uebersicht-leinwand', pfad: `/?wahltag=${WAHLTAG}`, ziel: '.gesamt', thema: 'dunkel', breite: 1920, hoehe: 1080 },
	{ name: 'detail-mobil', pfad: `/v?ags=03355000&wahl=219&gebiet=ebene_1_id_435&wahltag=${WAHLTAG}`, ziel: 'article', thema: 'dunkel', breite: 390, hoehe: 844 },
	{ name: 'detail-desktop', pfad: `/v?ags=03355000&wahl=219&gebiet=ebene_1_id_435&wahltag=${WAHLTAG}`, ziel: 'article', thema: 'hell', breite: 1280, hoehe: 720 }
] as const) {
	const seite = await browser.newPage();
	await seite.setViewport({ width: f.breite, height: f.hoehe });
	await seite.evaluateOnNewDocument((t: string) => localStorage.setItem('thema', t), f.thema);
	await seite.goto(`${BASIS}${f.pfad}`, { waitUntil: 'domcontentloaded' });
	await seite.waitForSelector(f.ziel);
	const ueberlauf = await seite.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	await seite.screenshot({ path: `${ZIEL}/${f.breite}x${f.hoehe}-${f.name}-${f.thema}.png` });
	if (ueberlauf > 1) fehler++;
	console.log(`${ueberlauf > 1 ? 'FEHLT' : ' ok  '} ${f.breite}x${f.hoehe} ${f.name} breit=${ueberlauf}`);
	await seite.close();
}

const auswahl = await browser.newPage();
await auswahl.setViewport({ width: 390, height: 844 });
await auswahl.goto(`${BASIS}/praesentation?wahltag=${WAHLTAG}`, { waitUntil: 'domcontentloaded' });
await auswahl.waitForSelector('.aktionen button:not([disabled])');
await auswahl.click('.aktionen button');
const alleAn = await auswahl.$$eval('.katalog input[type=checkbox]', (felder) =>
	felder.length > 0 && felder.every((feld) => (feld as HTMLInputElement).checked)
);
const wahltagBleibt = await auswahl.$eval('.start', (link) =>
	(link as HTMLAnchorElement).href.includes('wahltag=20210912')
);
await auswahl.click('.aktionen button');
const alleAus = await auswahl.$$eval('.katalog input[type=checkbox]', (felder) =>
	felder.every((feld) => !(feld as HTMLInputElement).checked)
);
if (!alleAn || !alleAus || !wahltagBleibt) fehler++;
console.log(alleAn && alleAus && wahltagBleibt ? ' ok   Auswahl mobil und Wahltag erhalten' : 'FEHLT Auswahl mobil oder Wahltag verloren');
await auswahl.close();

await browser.close();
console.log(fehler === 0 ? '\nAlles passt.' : `\n${fehler} Beanstandung(en).`);
process.exit(fehler === 0 ? 0 : 1);
