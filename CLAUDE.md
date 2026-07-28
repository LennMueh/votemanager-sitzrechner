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

**Gegen echte Daten entwickeln:** Alles akzeptiert `?wahltag=20210912` und rechnet
dann gegen die Kommunalwahl 2021 — vollständig ausgezählt, amtlich bestätigt.
Ohne den Parameter gilt `WAHLTAG = '20260913'`, wofür es bis zum Wahltag keine
Daten gibt. **Ohne diesen Parameter sieht man nichts.**

## Aufbau

Drei Schichten, strikt getrennt:

- **`src/lib/nkwg.ts`** — Sitzverteilung, **reine Funktionen ohne I/O**. Hier
  liegt die juristische Substanz; deshalb direkt testbar und ohne Netz prüfbar.
- **`src/lib/votemanager.ts`** — **einziger Netzzugriff** der Anwendung.
  Discovery, Parsen, Normalisierung auf das Modell aus `nkwg.ts`.
- **`src/lib/server/daten.ts`** — verbindet beides, hält Zwischenspeicher und
  Sitzzahlen. Nur die Routen unter `src/routes/api/` sprechen damit.

Diese Trennung ist Absicht: die Hosting-Entscheidung steht noch aus (siehe
README), und der gesamte Abruf hängt an `ladeVertretung()`. Netzaufrufe gehören
nirgendwo anders hin.

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

## Tests

`src/lib/alle-vertretungen.test.ts` prüft **jede der 53 Vertretungen** gegen das
amtliche Ergebnis 2021 — Sitze je Partei und jeden Namen. Das ist der stärkste
verfügbare Test und hat bereits einen echten Fehler gefunden. Bei Änderungen an
der Rechenlogik oder am Parser muss er grün bleiben.

11 der 14 Tests laufen ohne Netz (`nkwg.test.ts` teilweise, `sitzarc.test.ts`).

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

votemanager gehört uns nicht und hat keine zugesicherte API. Ergebnisse werden
30 s zwischengespeichert, `votemanager.ts` lässt **höchstens 6 Anfragen
gleichzeitig** zu, und bei Ausfall bleibt der letzte gute Stand mit `stale: true`
stehen statt einer Fehlerseite. Diese Drosselung nicht aufheben — die Übersicht
würde sonst rund 60 gleichzeitige Anfragen auslösen.

Aus demselben Grund gibt es **bewusst keine CI, die bei jedem Push die
Golden Tests fährt**.

## Sprache

Code, Kommentare, Bezeichner und Oberfläche sind auf Deutsch. Fachbegriffe
folgen dem Gesetzeswortlaut (Wahlvorschlag, Wahlbereich, Schnellmeldung,
Losentscheid), damit sich Code und NKWG gegenlesen lassen.
