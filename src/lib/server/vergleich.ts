export interface VergleichKandidat {
	wahltag: string;
	name: string;
	gebietName: string;
}

const normal = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

const amt = (text: string) => /landrat/.test(text) ? 'landrat'
	: /samtgemeinde.*burgermeister/.test(text) ? 'samtgemeindeburgermeister'
	: /oberburgermeister/.test(text) ? 'oberburgermeister'
	: /burgermeister/.test(text) ? 'burgermeister' : '';

export function normalisiereWahlart(name: string): string {
	const text = normal(name);
	if (/stichwahl/.test(text)) return `stichwahl:${amt(text)}`;
	for (const [art, muster] of [
		['landrat', /landrat/], ['burgermeister', /burgermeister/],
		['ortsrat', /ortsrat/], ['samtgemeinderat', /samtgemeinde(?:rat|wahl)/],
		['gemeinderat', /gemeinde(?:rat|wahl)/], ['stadtrat', /stadtrat/],
		['kreistag', /kreis(?:tag|wahl)/], ['regionsversammlung', /regionsversammlung/],
		['bezirksrat', /bezirksrat/]
	] as const) if (muster.test(text)) return art;
	return text.replace(/\W/g, '');
}

/** Gebietsname ohne Rechtsformzusatz — „Landkreises Lüneburg" wie „Landkreis Lüneburg". */
function gebietSchluessel(text: string): string {
	return normal(text)
		.replace(/\b(landkreis(?:es)?|gemeinderatswahl|samtgemeinde|gemeinde|stadt|flecken)\b/g, '')
		.replace(/\W/g, '');
}

export function gleichesGebiet(a: string, b: string): boolean {
	return gebietSchluessel(a) === gebietSchluessel(b);
}

export function waehleGegenwahl<T extends VergleichKandidat>(basis: T, kandidaten: T[]): T | undefined {
	const passend = kandidaten.filter((kandidat) =>
		kandidat.wahltag !== basis.wahltag &&
		gleichesGebiet(kandidat.gebietName, basis.gebietName) &&
		normalisiereWahlart(kandidat.name) === normalisiereWahlart(basis.name)
	);
	return passend.filter((kandidat) => kandidat.wahltag < basis.wahltag).sort((a, b) => b.wahltag.localeCompare(a.wahltag))[0]
		?? passend.filter((kandidat) => kandidat.wahltag > basis.wahltag).sort((a, b) => a.wahltag.localeCompare(b.wahltag))[0];
}

/**
 * Stabiler Schlüssel einer Vertretung über Wahlzyklen hinweg.
 *
 * Der frühere Schlüssel `<ags>|<Titel>` hielt keine zwei Wahlen durch:
 * votemanager schrieb 2021 „Kreiswahl - Landkreises Lüneburg" und 2026
 * „Kreiswahl - Landkreis Lüneburg", aus „Gemeindewahl" wurde „Wahl des
 * Gemeinderates". Von 55 geernteten Sitzzahlen passten dadurch noch fünf auf die
 * 1.945 Vertretungen der Wahl 2026.
 *
 * Deshalb dieselbe Normalisierung wie beim Wahlvergleich: Wahlart und Gebiet
 * getrennt und beide entkleidet. Der Gebietsname steht am Ende des Titels, wo er
 * nicht ohnehin als eigenes Feld vorliegt.
 */
export function vertretungsSchluessel(ags: string, name: string, gebietName?: string): string {
	const gebiet = gebietName ?? name.split(' - ').at(-1) ?? name;
	return `${ags}|${normalisiereWahlart(name)}|${gebietSchluessel(gebiet)}`;
}
