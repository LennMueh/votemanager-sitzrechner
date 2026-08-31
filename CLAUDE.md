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

### Woher die Sitzzahl kommt

Rangfolge in `bestimmeSitzzahl()`, sichtbar am Ergebnis:

1. **amtlich** — aus `Komponente.sitze` des laufenden Wahlabends, schlägt alles.
2. **hinterlegt** — `sitzzahlen*.json`, aus der Bekanntmachung der Wahlleitung.
3. **vorwahl** — amtliche Sitzzahl der letzten Wahl derselben Körperschaft aus
   dem Archiv, mit Wahltag.

Die Vorwahl steht hinten, weil die Sitzzahl der **Einwohnerzahl zu einem
gesetzlichen Stichtag** folgt und sich zwischen zwei Wahlen ändert: der Kreistag
Freudenstadt wuchs 2019→2024 von 41 auf 44, der Gemeinderat Hochdorf schrumpfte
von 13 auf 12. Abweichende Quellen werden **nicht aufgelöst, sondern angezeigt** —
sie bedeuten Wachstum über eine Staffelschwelle oder eine Satzung, die die Zahl
senkt (§ 46 Abs. 4 NKomVG erlaubt −2, −4 oder −6).

**Der Schlüssel ist nicht der Titel.** votemanager benennt dieselbe Wahl in jedem
Zyklus anders („Gemeindewahl" 2021 gegen „Wahl des Gemeinderates" 2026,
„Landkreises Lüneburg" gegen „Landkreis Lüneburg"). Über den rohen Titel passten
von 56 hinterlegten Sitzzahlen noch **fünf** auf die 1.945 Vertretungen der Wahl
2026; über `vertretungsSchluessel()` (`server/vergleich.ts`, dieselben
Normalisierer wie der Wahlvergleich) sind es 52.

### Nachernte

Ruhende Pfade prüfen alle 30 Tage, und die Kette
`termine.json → app.js → termin.json → ergebnis` hat vier Glieder — vier Monate
bis zur Sitzzahl einer Vorwahl. Der Zustand `nachernte` holt diese Kette für
vergangene Termine von Behörden mit **anstehender** Wahl genau einmal und fällt
danach auf `ruhend` zurück. Die Beförderung wählt nur Pfade mit `status IS NULL`
und ist damit idempotent und selbstbeendend.

Zwei Bremsen, die nicht verschwinden dürfen: `faellige()` gibt der Nachernte eine
**feste Scheibe von einem Zehntel** der Aufgaben, und **an einem Wahltag fällt sie
auf null** und die Plätze gehen an die Hauptauswahl zurück. Vorratsarbeit darf dem
laufenden Wahltag weder Plätze noch Bandbreite beim gemeinsamen Host nehmen.

Maßgeblich ist dabei das **Datum**, nicht der Zustand `wahlabend`. Über den
Zustand hing die Bremse an einem Signal, das manche Dokumente nie liefern:
Wahlbezirks-Ergebnisse tragen keinen Auszählstand (`hinweis` ist `[null]`), blieben
nach dem 30.08.2026 dauerhaft im Wahlabend — und schalteten die Nachernte damit
für immer ab. Deshalb haben `wahlabend` und `nachlauf` jetzt zusätzlich eine
**Zeitgrenze**: das Signal ist der schnelle Weg, die Uhr der sichere. Ohne sie
wurden 351 Pfade tagelang im 30-s-Takt abgefragt, für eine längst ausgezählte Wahl.

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
archiviert neun Länder mit Terminen bis 2001 zurück; `src/lib/wahlrecht/index.ts`
hält je Land den Rechtsstand, `daten.ts` wählt ihn nach `behoerde.land`.

**Ohne hinterlegten Rechtsstand wird nicht gerechnet** und die Oberfläche sagt
das. Kein stiller Rückfall auf das NKWG in einem Land, für das es nicht gilt.

### Der Korpus entscheidet, nicht die Vermutung

In `referenzen/` liegen rund 785 eingefrorene **amtliche Endergebnisse** aus acht
Ländern, jedes mit der amtlichen Liste der Gewählten. Damit wird nicht geglaubt,
sondern nachgerechnet:

- `src/lib/wahlrecht/verfahren.test.ts` stellt alle drei Zuteilungsverfahren
  gegen den Korpus. Das hinterlegte Verfahren muss die meisten Fälle treffen.
  Belegt wurde so: Saarland d'Hondt (277/304), Hessen und Sachsen-Anhalt
  Hare/Niemeyer, Sachsen, Baden-Württemberg und Nordrhein-Westfalen Sainte-Laguë.
- `src/lib/referenzen.test.ts` prüft Sitze **und Namen**. Länder mit
  `belegt: true` werden Fall für Fall geprüft; die übrigen über eine Quote in
  `referenzen/quoten.json`, die nur steigen darf. Die Lücke zur Gesamtzahl ist
  die Arbeitsliste des Landes.

`npm run ernte-archiv` erntet neu aus PostgreSQL (`DATABASE_URL` nötig).
**Niedersachsen bleibt ausgenommen**: § 37 NKWG verteilt über Wahlbereiche, ein
Referenzfall braucht dort die Wahlbereichs-Dokumente. Die 53 NI-Fälle stammen aus
der Netzernte (`npm run ernte`) und sind vollständig.

### Drei Tabellenformen im Feed

| Form | Länder | Gestalt |
|---|---|---|
| A | NI | drei Zeilen je Partei mit Suffixen, `sub_zeilen` = Bewerber |
| B | BW, SN, ST, MV, HE | eine Zeile je Wahlvorschlag, `sub_zeilen` = Bewerber |
| C | SL, NW, BY | flache Zeile, keine `sub_zeilen` |

Form A kommt außerhalb Niedersachsens **kein einziges Mal** vor. In Form B ist
die Zeilensumme über alle 122.969 Bewerberzeilen im Archiv ausnahmslos die Summe
der Bewerberstimmen — eine getrennte Listenstimme gibt es dort also nicht,
`listenstimmen` bleibt 0 und § 36 Abs. 4 NKWG hat keine Entsprechung. In Form C
füllt der Parser `vorschlaege` *und* `direktBewerber`; welcher Fall vorliegt,
entscheidet der Aufrufer über `ref.direktwahl`. Diese Doppelbefüllung nicht
entfernen, sonst landen saarländische Listen wieder im Direktwahl-Zweig.

### Namen gibt es nicht überall

Die amtlichen Listen verraten die Personenzuteilung: Hessen, Sachsen,
Sachsen-Anhalt und Niedersachsen führen „Personenwahl" mit Stimmenzahl, das
Saarland „Gebietsliste 1" und Nordrhein-Westfalen „Reservelistenplatz 1". Wo die
Listenreihenfolge entscheidet, veröffentlicht votemanager sie **während der
Auszählung** nicht — dort bleiben die Sitze so lange namenlos, statt eine
Reihenfolge zu erfinden. Oberfläche und Präsentationsmodus sagen das.

### Sobald das amtliche Endergebnis da ist

Dann ersetzt die amtliche Liste der Gewählten die gerechnete Verteilung
(`amtlicheVerteilung()` in `daten.ts`): echte Namen, echter Mandatstext, Farbe
und Prozente aus dem Stimmenverhältnis. Damit bekommt auch das Saarland Namen.

Gelesen wird sie **über die Spaltenüberschriften** (`amtlicheGewaehlte()` in
`votemanager.ts`), nie über Positionen. Die Tabelle hat je nach Land drei bis
fünf Spalten, und in der fünfspaltigen baden-württembergischen Form steht an
zweiter Stelle der Wohnbezirk — „Heidenheim, Schnaitheim, Aufhausen u.
Mergelstetten" sieht aus wie „Nachname, Vorname" und würde von jeder
Mustererkennung dafür gehalten. Jede archivierte Tabelle aller neun Länder trägt
`ueberschriften`; die Deutung ist damit eindeutig.

Die eigene Rechnung wird nicht weggeworfen, sondern **gegengeprüft**: weichen die
Sitze je Wahlvorschlag ab, meldet `gegenprobe` das sichtbar. Das ist der
Referenztest zur Laufzeit — er zeigt ein falsch hinterlegtes Landesrecht am
Wahlabend statt erst bei der nächsten Ernte.

Offen: Mecklenburg-Vorpommern (Verfahren trifft, Personen nicht — die amtliche
Liste nennt „Bewerber im Wahlbezirk … nach § 63 (4)"), Baden-Württemberg
(unechte Teilortswahl, die Sitzzahl wird aufgestockt) und Nordrhein-Westfalen
(Direktmandate stehen in eigenen Wahlbezirks-Dokumenten).

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

## Terminauswahl

870 Wahltermine von 1993 bis 2027 — als `<select>` unbrauchbar. `Wahlkalender.svelte`
zeigt stattdessen ein Monatsraster mit markierten Wahltagen und der Zahl der Wahlen
je Tag. Drei Entscheidungen, die nicht zufällig sind:

- **Natives `popover`** statt eigenem Overlay: Außenklick, Escape und Fokusfang
  kommen vom Browser. Position über CSS-Ankerpositionierung, mit zentriertem
  Rückfall — Aufwertung, keine Voraussetzung.
- **Nur Wahltage sind Knöpfe**, alles andere ist Text. Damit ist „nicht anwählbar"
  keine zusätzliche Prüfung, sondern ergibt sich aus dem Markup.
- Die Pfeiltasten hängen **an den Tagesknöpfen**, nicht am Container: ein
  Container mit Tastaturbedienung ohne eigene Rolle ist für Hilfsmittel eine
  Sackgasse (und `role="grid"` verlangt Zeilen, Zellen und eigene Fokusverwaltung).

Die Rasterberechnung liegt als reine Funktion in `src/lib/kalender.ts` — sie hat
Invarianten (immer 42 Felder, Woche ab Montag, UTC statt Ortszeit wegen der
Sommerzeitwechsel), die still kaputtgehen könnten.

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
