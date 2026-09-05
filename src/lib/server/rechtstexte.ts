import { readFile } from 'node:fs/promises';
import { marked } from 'marked';
import { env } from '$env/dynamic/private';

// Impressum und Datenschutzerklärung liegen bewusst NICHT in diesem Repo: es ist
// öffentlich, und die ladungsfähige Anschrift nach § 5 DDG gehört weder in einen
// Git-Verlauf noch in ein Container-Abbild. Die Texte kommen aus dem privaten
// Infra-Repo, im Cluster als ConfigMap-Volume unter /rechtstexte.
//
// Für die Entwicklung auf die Arbeitskopie zeigen:
//   RECHTSTEXTE_PFAD=../optiplex01_infra/rechtstexte npm run dev
const VERZEICHNIS = env.RECHTSTEXTE_PFAD || 'rechtstexte';

export type Rechtstext = 'impressum' | 'datenschutz';

// marked läuft ohne Sanitizer, gibt also rohes HTML aus dem Markdown weiter.
// Das ist vertretbar, weil die Quelle ausschließlich die ConfigMap ist — die
// Vertrauensgrenze ist die Cluster-Berechtigung, nicht die HTTP-Anfrage.
// Deshalb ist `name` ein Literaltyp mit zwei festen Aufrufstellen und niemals
// ein Wert aus url, params oder einem Formular: damit ist ein Pfaddurchgriff
// baulich ausgeschlossen und nicht bloß weggeprüft.
export async function rechtstext(name: Rechtstext): Promise<{ html: string }> {
	try {
		const roh = await readFile(`${VERZEICHNIS}/${name}.md`, 'utf8');
		return { html: await marked.parse(roh) };
	} catch {
		// Fehlt die Datei, zeigt die Seite ihren Warnkasten. Ein 500er auf dem
		// Impressum wäre schlechter als ein ehrlicher Hinweis.
		return { html: '' };
	}
}
