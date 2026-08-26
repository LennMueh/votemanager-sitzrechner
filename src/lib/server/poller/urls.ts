export const REGISTRY_URL = 'https://wahlen.votemanager.de/behoerden.json';

export function termineUrl(basisUrl: string, ags: string): string {
	return new URL(`${encodeURIComponent(ags)}/api/termine.json`, mitSlash(basisUrl)).href;
}

export function terminUrl(basisUrl: string, pfad: string): string {
	return new URL(pfad, mitSlash(basisUrl)).href;
}

/** Liest relative API-Pfade aus der von votemanager erzeugten app.js. */
export function apiWurzel(termin: string, appJs: string): string {
	const konfiguriert = appJs.match(/(?:api(?:Root|Wurzel|Url|URL)|api[_-]?wurzel)\s*[:=]\s*["']([^"']+)["']/i)
		?? appJs.match(/["'](\.\.\/(?:daten\/)?api\/(?:praesentation\/)?)["']/i);
	const treffer = konfiguriert ?? appJs.match(/["'](\.\.\/(?:daten\/)?api\/(?:praesentation\/)?)/i);
	if (!treffer) throw new Error('API-Wurzel fehlt in app.js');
	const basis = new URL(termin).pathname.endsWith('/praesentation/')
		? mitSlash(termin)
		: new URL('js/app.js', mitSlash(termin)).href;
	return new URL(treffer[1], basis).href;
}

function mitSlash(url: string): string {
	return url.endsWith('/') ? url : `${url}/`;
}
