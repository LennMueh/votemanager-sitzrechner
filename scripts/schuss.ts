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
		faelle.push({ name: 'kreistag-kacheln', v: KREISTAG, seite: 1, thema, breite, hoehe });
	}
	faelle.push({ name: 'oedeme-kacheln', v: OEDEME, seite: 1, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'obwahl-stichwahl', v: OB_WAHL, seite: 0, thema: 'hell', breite, hoehe });
	faelle.push({ name: 'obwahl-gewaehlt', v: OB_STICH, seite: 0, thema: 'dunkel', breite, hoehe });
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
		waitUntil: 'networkidle0'
	});
	// Rotation anhalten, damit die Aufnahme nicht mitten im Wechsel entsteht.
	await seite.keyboard.press(' ');
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

await browser.close();
console.log(fehler === 0 ? '\nAlles passt.' : `\n${fehler} Beanstandung(en).`);
process.exit(fehler === 0 ? 0 : 1);
