# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Was das Projekt tut

Rechnet am Wahlabend der niedersächsischen Kommunalwahl (13.09.2026, Stichwahlen
27.09.) laufend aus, **wer nach NKWG in die Vertretungen des Landkreises Lüneburg
einziehen würde**. Grundlage sind die Zwischenstände von votemanager (KDO).

Der Daseinsgrund: votemanager veröffentlicht während der Auszählung **nur
Stimmen**. Der `sitze`-Block mit den gewählten Personen erscheint erst im
amtlichen Endergebnis. Diese Lücke schließt die Anwendung.

## Befehle

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Alle Tests (holen echte Daten von votemanager) |
| `npx vitest run src/lib/nkwg.test.ts` | Eine Testdatei |
| `npx vitest run -t "Ortsrat Oedeme"` | Einzelner Test über den Namen |
| `npm run build` | Produktionsbau |
| `npm run harvest` | `src/lib/sitzzahlen.json` aus den 2021-Daten neu erzeugen |
| `npm run schuss` | Präsentationsmodus aufnehmen und auf Überlauf prüfen (Dev-Server muss laufen) |
| `npm run ernte` | Amtliche NI-Referenzfälle offline einfrieren |
| `npm run migrieren` | PostgreSQL-Migrationen idempotent einspielen |
| `npm run poller -- --einmalig` | Einen Poller-Durchlauf ausführen |

**Gegen echte Daten entwickeln:** Alles akzeptiert `?wahltag=20210912` und rechnet
dann gegen die Kommunalwahl 2021 — vollständig ausgezählt, amtlich bestätigt.
Ohne den Parameter gilt `WAHLTAG = '20260913'`, wofür es bis zum Wahltag keine
Daten gibt. **Ohne diesen Parameter sieht man nichts.**

## Aufbau

Vier Schichten, strikt getrennt:

- **`src/lib/nkwg.ts`** — Sitzverteilung, **reine Funktionen ohne I/O**. Hier
  liegt die juristische Substanz; deshalb direkt testbar und ohne Netz prüfbar.
- **`src/lib/votemanager.ts`** — Parser und Normalisierung auf das Rechenmodell;
  die alten Netzfunktionen bleiben ausschließlich für Parser-/Erntetests.
- **`src/lib/server/poller/`** — einziger produktiver Netzzugriff, Discovery,
  Drosselung, Zustandsmaschine und bedingte Abrufe.
- **`src/lib/server/db.ts` und `daten.ts`** — PostgreSQL-Archiv und Berechnung
  aus dem letzten gespeicherten Stand. Web-Pods sprechen nie mit votemanager.

Diese Trennung ist Absicht: Kubernetes skaliert nur die Web-Schicht; der Poller
bleibt durch Deployment und PostgreSQL-Advisory-Lock ein Singleton.

## votemanager-API — was man wissen muss

Basis: `https://votemanager.kdo.de/<YYYYMMDD>/<AGS>/api/praesentation/`

- **Kein CORS.** Der Abruf muss serverseitig laufen. Ein Browser-`fetch` gegen
  votemanager scheitert immer.
- **Statische Datei-API**: keine Query-Parameter, kein Filtern. Man holt ganze
  Gebiets-Dokumente und rechnet selbst.
- **Zahlen sind deutsch formatierte Strings** („12.792", „27,61 %") → immer über
  `parseZahl()`.
- Ein `ergebnis_*.json` hat je Partei **drei Zeilen**, erkannt an den Suffixen
  „ - Summe Partei- und Kandidaten-Stimmen", „ - Stimmen für die Partei",
  „ - Summe Kandidaten-Stimmen". Die Kandidaten stehen in `sub_zeilen` **in
  Listenplatz-Reihenfolge**.
- **Einzelwahlvorschläge sehen völlig anders aus**: eine einzelne Zeile
  `"Alexander Cohn, Einzelbewerber Cohn"` (Person, Komma, Wahlvorschlag). Sie
  werden erst nach dem Durchlauf erkannt — gibt es Parteizeilen, sind Restzeilen
  Einzelwahlvorschläge, sonst ist es eine Direktwahl. Das war die Ursache eines
  echten Fehlers; die Open-Data-CSVs kennen diesen Fall gar nicht.
- **Die Open-Data-CSVs werden bewusst nicht benutzt.** Sie enthalten keine Namen;
  man bräuchte die JSON ohnehin, und die bringt die Stimmen schon mit.

**Wahlbereiche** (`holeWahlbereiche`): es gibt keine verlässliche Angabe, ob eine
Übersichts-Ebene zu *unserem* Wahlgebiet gehört — bei Gemeindewahlen teilen sich
mehrere Gemeinden eine Wahl-ID. Deshalb wird gegengerechnet: nur wenn die Summe
der Wahlbereichsstimmen das Gesamtergebnis trifft, gelten sie. Sonst
Ein-Wahlbereich-Fall (§ 36). **Diese Gegenprobe nicht entfernen.**

## Sitzzahlen

Die Zahl der zu vergebenden Sitze steht **nicht im Feed** — sie folgt aus § 46
NKomVG nach Einwohnerzahl. `src/lib/sitzzahlen.json` ist per `npm run harvest`
aus dem amtlichen Endergebnis 2021 geerntet (Schlüssel `<ags>|<Titel>`).

Vor dem 13.09.2026 gegen die Bekanntmachungen der Wahlleitungen prüfen. Fehlt
eine Sitzzahl, **rechnet die Anwendung bewusst nicht** und sagt das sichtbar.

`npm run harvest` schreibt `sitzzahlen.json` vollständig neu. Handgepflegte
Einträge gehören deshalb in `src/lib/sitzzahlen-manuell.json`; `daten.ts` führt
beide zusammen.

## Rechtliche Regeln (NKWG)

Vollständig in `src/lib/nkwg.ts` umgesetzt und kommentiert. Die Fallstricke:

- **§ 36 Abs. 4** teilt die Sitze einer Partei nochmals zwischen *Liste* und
  *Gesamtheit der Bewerber mit Stimmen* auf — erneut Hare/Niemeyer. Wer das
  überspringt, bekommt plausible, aber falsche Ergebnisse.
- Hare/Niemeyer mit **exakter Ganzzahlarithmetik (BigInt)**. Bei knappen
  Zahlenbruchteilen entscheidet sonst ein Rundungsfehler über ein Mandat.
- **Losentscheide werden nie still aufgelöst**, sondern als `losentscheid`
  gemeldet und angezeigt.
- **Unbesetzte Sitze** (§ 36 Abs. 7) sind eigene Einträge mit `unbesetzt: true`.
  Invariante: `Gewählte + Unbesetzte === Sitzzahl`. Kommt real vor (2021:
  Oedeme, Westergellersen, Barendorf).
- Keine 5-%-Sperrklausel.

## Andere Länder

Der Feed ist nicht auf Niedersachsen beschränkt, das Recht schon. Der Poller
archiviert, was er findet; `daten.ts` wählt den Rechtsstand nach `behoerde.land`.

**Saarland** (`src/lib/wahlrecht/saarland.ts`, § 41 KWG SL i. V. m. § 209 KSVG):
d'Hondt statt Hare/Niemeyer, keine Sperrklausel seit 2008, **reine Listenwahl mit
geschlossenen Listen**. Zwei Folgen, die man kennen muss:

1. Das Ergebnis-JSON hat **eine flache Zeile je Wahlvorschlag** — keine
   `sub_zeilen`, keines der drei niedersächsischen Suffixe. `parseErgebnis` füllt
   in diesem Fall `vorschlaege` *und* `direktBewerber`; welcher Fall vorliegt,
   entscheidet der Aufrufer über `ref.direktwahl`. Diese Doppelbefüllung nicht
   entfernen, sonst landen saarländische Listen wieder im Direktwahl-Zweig.
2. Der Feed nennt **keine Bewerbernamen**. Berechenbar sind nur Sitze je
   Wahlvorschlag; Oberfläche und Präsentationsmodus sagen das und lassen die
   Personenliste weg. § 41 Abs. 3 bis 5 (Bereichs-/Gebietsliste, Weitergabe,
   Reihenfolge) sind aus demselben Grund nicht umgesetzt.

## Tests

`src/lib/referenzen.test.ts` prüft die Rechenschicht offline gegen 53 eingefrorene
amtliche Ergebnisse. `alle-vertretungen.test.ts` bleibt der getrennte Netztest
für den Parser; keiner ersetzt den anderen.

## Präsentationsmodus — zwei Fallen

`src/lib/praesentation/Buehne.svelte` misst den Inhalt und stellt `--skala`
(0,5 bis 2,2) so ein, dass die Seite gefüllt, aber nicht überlaufen wird. Alle
Größen der Seiteninhalte hängen daran. Bandbreite: 7 bis 58 Sitze auf unbekannten
Beamer-Auflösungen — feste Größen funktionieren hier nicht.

Beide Fallen haben real Inhalt verschwinden lassen:

1. **Kein `columns` (CSS-Spaltensatz) für die Kacheln.** Zu viel Inhalt wandert
   dann seitlich in unsichtbare Spalten — ganze Fraktionen fehlen, ohne dass eine
   Höhenmessung anschlägt. Raster verwenden, das nach unten wächst.
2. **Kein `height: 100%` auf gemessenem Inhalt** (etwa mit `align-content:
   center`). Das lässt Elemente überlappen *und* versteckt den Überlauf vor der
   Messung.

Die Messung prüft deshalb **beide Richtungen** (`scrollHeight` und `scrollWidth`).

**Layoutänderungen mit `npm run schuss` prüfen**, nicht nur ansehen: das Skript
nimmt 14 Ansichten auf (1920×1080 und 1280×720, hell und dunkel) und schlägt bei
Überlauf an. Es braucht einen laufenden Dev-Server und nutzt Chrome aus dem
Puppeteer-Cache.

## Farben und Darstellung

- **Parteifarben kommen von votemanager** und sind Entitäts-Identität (SPD rot,
  CDU schwarz). Nicht durch eine Designsystem-Palette ersetzen.
- Deshalb gilt: **nie Farbe allein**. Parteinamen stehen immer im Klartext daneben,
  Mandatsart als Wort („direkt" / „Liste") plus Form, unbesetzte Sitze gestrichelt.
- Sitzpunkte tragen einen Ring in Randfarbe, sonst verschwindet CDU-Schwarz im
  Dunkelmodus.
- Hell/Dunkel über `light-dark()` und `color-scheme`; `data-theme` am `<html>`
  übersteuert, ein Inline-Skript in `src/app.html` setzt es vor dem ersten
  Zeichnen.

## Rücksicht auf fremde Infrastruktur

votemanager gehört uns nicht und hat keine zugesicherte API. Genau ein Poller
nutzt ETag/Last-Modified, höchstens 20 Starts/s und zwei parallele Abrufe je Host.
Live-Wahlen laufen im 30-s-Takt; Fehler führen zu Backoff. Web-Pods lesen nur den
letzten archivierten Stand und verteilen Änderungen über PostgreSQL und SSE.

Aus demselben Grund gibt es **bewusst keine CI, die bei jedem Push die
Golden Tests fährt**.

## Sprache

Code, Kommentare, Bezeichner und Oberfläche sind auf Deutsch. Fachbegriffe
folgen dem Gesetzeswortlaut (Wahlvorschlag, Wahlbereich, Schnellmeldung,
Losentscheid), damit sich Code und NKWG gegenlesen lassen.
