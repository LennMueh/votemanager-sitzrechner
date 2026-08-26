# Sitzrechner für Kommunalwahlen

Archiviert veröffentlichte VoteManager-Wahlen und macht sie in einem
bundesweiten Katalog verfügbar. Für Vertretungen mit hinterlegter Sitzzahl
rechnet die Anwendung am Wahlabend laufend aus, **wer gerade in den Rat
einziehen würde**. Landkreis Lüneburg bleibt der vollständig geprüfte
Referenzdatensatz; Übersicht, Präsentation und Wahlkatalog verarbeiten alle in
PostgreSQL bekannten Termine und Behörden.

Hintergrund: votemanager (KDO) veröffentlicht während der Auszählung nur
Stimmen, keine Sitzverteilung. Die kommt erst mit dem amtlichen Endergebnis.
Dieses Werkzeug schließt die Lücke.

## Loslegen

```bash
npm install
npm run dev
```

Ohne Parameter verwendet die Anwendung automatisch den frühesten bekannten
Termin ab heute, andernfalls den jüngsten gespeicherten Termin. Einen bestimmten
Wahltag wählt man über die Oberfläche oder direkt über die URL:

```
http://localhost:5173/?wahltag=20210912
```

Die Auswahl bleibt beim Navigieren, in Detail-, Präsentations- und
Vergleichslinks über `wahltag=YYYYMMDD` erhalten.

| Befehl | Zweck |
|---|---|
| `npm run dev` | Entwicklungsserver |
| `npm test` | Testlauf (holt echte Daten von votemanager) |
| `npm run build` | Produktionsbau |
| `npm run harvest` | `src/lib/sitzzahlen.json` aus den 2021-Daten neu erzeugen |
| `npm run schuss` | Präsentationsmodus aufnehmen und auf Überlauf prüfen (Dev-Server muss laufen) |

## Aufbau

| Datei | Inhalt |
|---|---|
| `src/lib/nkwg.ts` | Sitzverteilung nach §§ 36, 37, 45g NKWG. Reine Rechenlogik, kein I/O. |
| `src/lib/votemanager.ts` | Normalisierung der archivierten votemanager-JSON-Daten. |
| `src/lib/server/daten.ts` | Dynamische Terminwahl, Berechnung und letzter guter Stand bei Ausfall. |
| `src/lib/server/db.ts` | PostgreSQL-Zugriff und Übernahme der vom Poller entdeckten Termine und Wahlen. |
| `src/lib/server/vergleich.ts` | Suche passender Gegenwahlen über AGS, Gebiet und normalisierte Wahlart. |
| `src/lib/sitzarc.ts` | Geometrie des Halbkreis-Sitzdiagramms. |
| `src/lib/sitzzahlen.json` | Sitzzahlen je Vertretung (aus 2021 geerntet, siehe unten). |
| `src/routes/` | Übersicht, Detailansicht, Präsentationsmodus, JSON-API. |

## Was gerechnet wird

- **§ 36 Abs. 2** Sitze auf die Wahlvorschläge nach **Hare/Niemeyer**, keine
  Sperrklausel. Exakte Bruchrechnung mit `BigInt` — bei knappen Zahlenbruchteilen
  würde ein Rundungsfehler sonst über ein Mandat entscheiden.
- **§ 36 Abs. 3** Mehrheitsklausel.
- **§ 36 Abs. 4** Aufteilung der Sitze einer Partei zwischen Liste und Bewerbern.
- **§ 36 Abs. 5** Personenwahl nach höchsten Stimmenzahlen („direkt").
- **§ 36 Abs. 6** Listensitze in Listenreihenfolge („Listenplatz N").
- **§ 37** Mehrere Wahlbereiche, samt Übertrag überzähliger Sitze (Abs. 5).
- **§ 36 Abs. 7** Sitze, die niemand besetzen kann, werden als **unbesetzt**
  ausgewiesen — nicht stillschweigend weggerechnet.
- **§ 45g** Direktwahlen: absolute Mehrheit, sonst Stichwahl.

**Losentscheide werden nie selbst aufgelöst.** Wo das Gesetz losen lässt, sagt
die Anwendung das und markiert die Stelle.

## Verlässlichkeit

Die Berechnung wird gegen das **amtliche Endergebnis 2021** geprüft — für
*jede* der 53 Vertretungen im Landkreis, Partei für Partei und Name für Name:

```bash
npm test
```

Enthalten sind unter anderem der Kreistag (58 Sitze, fünf Kreiswahlbereiche,
§ 37), der Samtgemeinderat Bardowick (ein Wahlbereich, § 36) und der Ortsrat
Oedeme, bei dem 2021 tatsächlich ein Sitz unbesetzt blieb.

Trotzdem: **ohne Gewähr.** Amtlich ist allein die Feststellung des
Wahlausschusses.

Die Darstellung wird ebenfalls maschinell geprüft: `npm run schuss` nimmt
Übersicht, Detail- und Präsentationsmodus in beiden Themen vom 360 × 640-Handy
bis zur 1920 × 1080-Leinwand auf und schlägt bei Überlauf an.

## Wahltermine und Navigation

PostgreSQL ist die zentrale Quelle für bekannte Wahltermine. Der reguläre
Poller liest die Terminlisten jeder aktiven Behörde wiederholt ein und übernimmt
neu veröffentlichte Termine, Instanzen und Wahlen ohne Codeänderung. Die
optionale Kommandozeilen-Auswahl `--wahltage=...` dient nur gezielten Probe- und
Backfill-Läufen.

Unter `/wahlen` führt die Auswahl durch Bundesland, Landkreis/Region und
Behörde. Jede Ebene zeigt ihren aggregierten Schnellmeldungsstand; der große
Fortschrittsstand folgt der geöffneten Ebene, etwa Niedersachsen → Landkreis
Lüneburg → Samtgemeinde Bardowick.

## Präsentationsmodus

Je Ratswahl drei Vollbildseiten, die alle 15 Sekunden wechseln:

1. **Übersicht** — Sitzanzahl je Wahlvorschlag und der Halbkreis
2. **Stimmenverhältnis** — Torte und vollständige Legende aller Parteien und Listen,
   einschließlich Wahlvorschlägen ohne Sitz
3. **Kacheln** — die voraussichtlichen Mitglieder, nach Wahlvorschlag gruppiert,
   je Kachel Name und „direkt" bzw. „Liste"

Gebietsansichten ohne eigene Sitzvergabe, etwa die Kreiswahl auf Gemeindeebene,
zeigen ausschließlich das Stimmenverhältnis und keine fiktiven Sitze.

Direktwahlen bekommen stattdessen eine Seite mit waagerechten Balken und einer
markierten 50-%-Linie — die Schwelle, an der sich nach § 45g NKWG Wahl oder
Stichwahl entscheidet.

Die Schriftgröße stellt sich selbst ein: der Inhalt wird gemessen und so weit
vergrößert oder verkleinert, bis er die Seite füllt, ohne überzulaufen. Damit
sieht ein Ortsrat mit 7 Sitzen genauso vollständig aus wie der Kreistag mit 58.

Tastatur: `←` `→` blättern, Leertaste hält an, `F` schaltet Vollbild.
Hell/Dunkel lässt sich oben rechts umschalten (System / Hell / Dunkel).

Ohne konkrete Auswahl öffnet `/praesentation` einen durchsuchbaren Wahlkatalog.
Der gewählte Termin begrenzt zuerst die verfügbaren Länder, Regionen, Behörden
und Wahlarten; eindeutige Ebenen werden automatisch vorausgewählt. So zeigt der
Termin 14.09.2025 beispielsweise ausschließlich die vorhandenen NRW-Wahlen.

## Vergleiche

Ein Vergleich wird von einer konkreten Wahl unter `/wahlen` geöffnet. Der Link
erscheint nur, wenn eine passende Gegenwahl und auswertbare Ergebnisdaten für
beide Termine vorliegen. Die Zuordnung erfolgt bundesweit über AGS, Gebiet und
normalisierte Wahlart; Schreibvarianten wie „Landkreis“ und „Landkreises“ werden
berücksichtigt, verschiedene Direkt- und Stichwahlämter nicht vermischt.

Sitzverteilungen stehen terminweise nebeneinander. Gewählte Personen werden je
Partei oder Liste in Zweispaltentabellen verglichen; gleiche normalisierte Namen
stehen in derselben Zeile, fehlende Gegenstücke erscheinen als `—`. Ohne
vollständige Auswahl leitet `/vergleich` zurück nach `/wahlen`.

## Vor dem Wahlabend zu erledigen

1. **Sitzzahlen prüfen.** `src/lib/sitzzahlen.json` ist aus 2021 vorbelegt.
   Einwohnerzahlen können Schwellen nach § 46 NKomVG überschritten haben — Werte
   gegen die Bekanntmachungen der Wahlleitungen abgleichen. Fehlt eine Sitzzahl,
   sagt die Anwendung das sichtbar und rechnet nicht.
2. **Discovery und Poller prüfen.** Terminliste, Wahlbereichszuschnitte,
   Ortsräte und Direktwahlen werden dynamisch übernommen; ein Probe-/Backfill-Lauf
   kann bei Bedarf auf den Wahltag begrenzt werden.
3. **Deployment proben** und anschließend Health (`/api/health`) sowie Ready
   (`/api/ready`) prüfen.

## Deployment

Die Anwendung läuft mit `adapter-node` auf Kubernetes: beliebig viele Web-Pods
lesen ausschließlich aus PostgreSQL, genau ein Poller spricht mit votemanager.
PostgreSQL übernimmt Archiv, Cache und `LISTEN`/`NOTIFY`; Browser erhalten
Änderungen per SSE statt durch eigenes Polling. Container, Helm-Chart und die
lokale Anleitung stehen in [docs/deployment.md](docs/deployment.md).

## Rücksicht auf fremde Infrastruktur

votemanager gehört uns nicht und hat keine zugesicherte API. Deshalb arbeitet
nur ein Poller mit bedingten Anfragen, höchstens 20 Starts pro Sekunde und zwei
gleichzeitigen Abrufen je Host. Live-Wahlen werden alle 30 Sekunden geprüft;
unveränderte Antworten kosten dank ETag fast keine Nutzdaten. Ein Ausfall lässt
den letzten archivierten Stand sichtbar als veraltet stehen.
