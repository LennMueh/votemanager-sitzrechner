import { createHash } from 'node:crypto';
import { konfiguration, type PollerKonfiguration } from './config.ts';
import { Drossel } from './drossel.ts';
import { holeJson, type AbrufStand } from './http.ts';
import { REGISTRY_URL } from './urls.ts';
import { fehlerBackoff, type Zustand } from './zustand.ts';

export interface PollerAufgabe {
	id: string;
	url: string;
	instanzId?: number;
	pfad: string;
	zustand: Zustand;
	prioritaet: number;
	stand?: AbrufStand;
	fehler: number;
	backfill?: boolean;
	letzteAenderung?: Date;
	zustandVorFehler?: Zustand;
}

export interface PollerSpeicher {
	faellige(limit: number, backfill: boolean): Promise<PollerAufgabe[]>;
	erfolg(aufgabe: PollerAufgabe, ergebnis: {
		geaendert: boolean;
		stand: AbrufStand;
		inhalt?: unknown;
		hash?: string;
		geprueft: Date;
	}): Promise<void>;
	fehler(aufgabe: PollerAufgabe, fehler: unknown, naechstePruefung: Date): Promise<void>;
	registryFaellig(jetzt: Date): Promise<boolean>;
	registryStand(): Promise<AbrufStand>;
	registrySpeichern(inhalt: unknown | undefined, stand: AbrufStand, geprueft: Date): Promise<void>;
	behoerdenSpeichern(behoerden: Behoerde[], geprueft: Date, vollstaendig?: boolean): Promise<void>;
}

export interface Behoerde { ags: string; name: string; ort: string; land: string; basisUrl: string }

export function parseRegistry(rohdaten: unknown): Behoerde[] {
	const liste = Array.isArray(rohdaten)
		? rohdaten
		: (rohdaten as { behoerden?: unknown; data?: unknown })?.behoerden ?? (rohdaten as { data?: unknown })?.data;
	if (!Array.isArray(liste)) throw new Error('Ungültige Behörden-Registry');
	return liste.flatMap((wert): Behoerde[] => {
		if (Array.isArray(wert)) {
			const html = text(wert[0]);
			const href = html.match(/href=["']([^"']+)/i)?.[1];
			if (!href) throw new Error('Ungültiger Behörden-Link');
			const url = new URL(href);
			const ags = url.pathname.match(/\/(\d{5,12})\/index\.html$/)?.[1];
			if (!ags) return [];
			url.pathname = url.pathname.replace(new RegExp(`${ags}/index\\.html$`), '');
			return [{
				ags,
				basisUrl: url.href,
				name: dekodiere(html.replace(/<[^>]+>/g, '').trim()),
				ort: text(wert[1]),
				land: text(wert[2])
			}];
		}
		if (!wert || typeof wert !== 'object') throw new Error('Ungültiger Behörden-Eintrag');
		const o = wert as Record<string, unknown>;
		const ags = text(o.ags ?? o.ags_nr ?? o.schluessel);
		const basisUrl = text(o.url ?? o.basis_url ?? o.basisUrl);
		if (!/^\d{5,12}$/.test(ags) || !/^https:\/\//.test(basisUrl)) throw new Error(`Ungültige Behörde ${ags}`);
		return [{ ags, basisUrl, name: text(o.name), ort: text(o.ort), land: text(o.land ?? o.bundesland) }];
	});
}

function text(wert: unknown): string { return typeof wert === 'string' ? wert.trim() : ''; }
function dekodiere(wert: string): string {
	return wert.replace(/&(#\d+|auml|ouml|uuml|Auml|Ouml|Uuml|szlig|amp);/g, (_, code: string) => {
		if (code.startsWith('#')) return String.fromCodePoint(Number(code.slice(1)));
		return ({ auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', amp: '&' } as Record<string, string>)[code];
	});
}

export class Poller {
	private drossel: Drossel;
	private speicher: PollerSpeicher;
	private config: PollerKonfiguration;
	private fetchImpl: typeof fetch;

	constructor(
		speicher: PollerSpeicher,
		config: PollerKonfiguration = konfiguration(),
		fetchImpl: typeof fetch = fetch
	) {
		this.speicher = speicher;
		this.config = config;
		this.fetchImpl = fetchImpl;
		this.drossel = new Drossel(config.globalProSekunde, config.parallelProHost);
	}

	async einmal(jetzt = new Date()): Promise<number> {
		if (await this.speicher.registryFaellig(jetzt)) await this.registry(jetzt);
		const aufgaben = await this.speicher.faellige(100, this.config.backfill);
		await Promise.all(aufgaben.map((aufgabe) => this.bearbeite(aufgabe, jetzt)));
		return aufgaben.length;
	}

	private async registry(jetzt: Date): Promise<void> {
		const stand = await this.speicher.registryStand();
		const ergebnis = await this.drossel.ausfuehren(REGISTRY_URL, () =>
			holeJson(REGISTRY_URL, stand, { kontakt: this.config.kontakt, fetch: this.fetchImpl })
		);
		await this.speicher.registrySpeichern(ergebnis.geaendert ? ergebnis.inhalt : undefined, ergebnis.stand, jetzt);
		if (ergebnis.geaendert) {
			const alle = parseRegistry(ergebnis.inhalt);
			const ausgewaehlt = this.config.regionen?.length
				? alle.filter((b) => this.config.regionen!.some((region) => b.ags.startsWith(region)))
				: alle;
			await this.speicher.behoerdenSpeichern(ausgewaehlt, jetzt, !this.config.regionen?.length);
		}
	}

	private async bearbeite(aufgabe: PollerAufgabe, jetzt: Date): Promise<void> {
		try {
			const ergebnis = await this.drossel.ausfuehren(aufgabe.url, () =>
				holeJson(aufgabe.url, aufgabe.stand, { kontakt: this.config.kontakt, fetch: this.fetchImpl })
			);
			const inhalt = ergebnis.geaendert ? ergebnis.inhalt : undefined;
			await this.speicher.erfolg(aufgabe, {
				geaendert: ergebnis.geaendert,
				stand: ergebnis.stand,
				inhalt,
				hash: inhalt === undefined ? undefined : createHash('sha256').update(JSON.stringify(inhalt)).digest('hex'),
				geprueft: jetzt
			});
		} catch (fehler) {
			const retryAfterMs = (fehler as { retryAfterMs?: number }).retryAfterMs;
			await this.speicher.fehler(
				aufgabe,
				fehler,
				new Date(jetzt.getTime() + fehlerBackoff(aufgabe.fehler + 1, retryAfterMs))
			);
		}
	}
}
