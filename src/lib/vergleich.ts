import type { VertretungErgebnis } from '$lib/server/daten';

export interface VergleichPerson {
	liste: string;
	name: string;
	mandat: string;
}

const normal = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();

function personen(ergebnis: Pick<VertretungErgebnis, 'verteilung' | 'amtlich'>): VergleichPerson[] {
	const berechnet = ergebnis.verteilung?.sitze.flatMap((s) => s.name ? [{ liste: s.partei, name: s.name, mandat: s.mandat }] : []) ?? [];
	return berechnet.length ? berechnet : (ergebnis.amtlich?.gewaehlte ?? []).flatMap(([liste, name, mandat]) =>
		liste && name ? [{ liste, name, mandat: mandat ?? '' }] : []);
}

export function vergleichePersonen(
	aktuell: Pick<VertretungErgebnis, 'verteilung' | 'amtlich'>,
	vergleich: Pick<VertretungErgebnis, 'verteilung' | 'amtlich'>
) {
	const links = personen(aktuell);
	const rechts = personen(vergleich);
	const listen = [...new Set([...links.map((p) => normal(p.liste)), ...rechts.map((p) => normal(p.liste))])];
	return listen.map((listenKey) => {
		const a = links.filter((p) => normal(p.liste) === listenKey);
		const uebrig = rechts.filter((p) => normal(p.liste) === listenKey);
		const zeilen: { aktuell?: VergleichPerson; vergleich?: VergleichPerson }[] = a.map((person) => {
			const index = uebrig.findIndex((p) => normal(p.name) === normal(person.name));
			return { aktuell: person, vergleich: index < 0 ? undefined : uebrig.splice(index, 1)[0] };
		});
		zeilen.push(...uebrig.map((person) => ({ aktuell: undefined, vergleich: person })));
		return { liste: a[0]?.liste ?? uebrig[0]?.liste ?? listenKey, zeilen };
	});
}
