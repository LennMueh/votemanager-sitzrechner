# Sitzrechner Kommunalwahl 2026 — Landkreis Lüneburg

Rechnet am Wahlabend laufend aus, **wer gerade in den Rat einziehen würde** — für
alle Vertretungen im Landkreis Lüneburg, mit Auszählungsstand und
Präsentationsmodus für die Leinwand.

Hintergrund: votemanager (KDO) veröffentlicht während der Auszählung nur
Stimmen, keine Sitzverteilung. Die kommt erst mit dem amtlichen Endergebnis.
Dieses Werkzeug schließt die Lücke.

## Loslegen

```bash
npm install
npm run dev
```

Ohne Parameter rechnet die Anwendung gegen den **13.09.2026**. Solange es dafür
noch keine Daten gibt, hängt man den Wahltag der letzten Kommunalwahl an:

```
http://localhost:5173/?wahltag=20210912
```

Das rechnet gegen die echten Daten von 2021 — praktisch zum Ausprobieren und
zum Testen des Präsentationsmodus.

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
| `src/lib/votemanager.ts` | Abruf und Normalisierung der votemanager-JSON-API. Einziger Netzzugriff. |
| `src/lib/server/daten.ts` | Zusammenführung, Zwischenspeicher, letzter guter Stand bei Ausfall. |
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

Die Darstellung wird ebenfalls maschinell geprüft: `npm run schuss` nimmt den
Präsentationsmodus in beiden Themen bei 1920 × 1080 und 1280 × 720 auf und
schlägt an, sobald Inhalt aus der Seite läuft — waagerecht wie senkrecht.

## Präsentationsmodus

Je Ratswahl zwei Vollbildseiten, die alle 15 Sekunden wechseln:

1. **Übersicht** — Sitzanzahl je Wahlvorschlag und der Halbkreis
2. **Kacheln** — die voraussichtlichen Mitglieder, nach Wahlvorschlag gruppiert,
   je Kachel Name und „direkt" bzw. „Liste"

Direktwahlen bekommen stattdessen eine Seite mit waagerechten Balken und einer
markierten 50-%-Linie — die Schwelle, an der sich nach § 45g NKWG Wahl oder
Stichwahl entscheidet.

Die Schriftgröße stellt sich selbst ein: der Inhalt wird gemessen und so weit
vergrößert oder verkleinert, bis er die Seite füllt, ohne überzulaufen. Damit
sieht ein Ortsrat mit 7 Sitzen genauso vollständig aus wie der Kreistag mit 58.

Tastatur: `←` `→` blättern, Leertaste hält an, `F` schaltet Vollbild.
Hell/Dunkel lässt sich oben rechts umschalten (System / Hell / Dunkel).

## Vor dem 13.09.2026 zu erledigen

1. **Sitzzahlen prüfen.** `src/lib/sitzzahlen.json` ist aus 2021 vorbelegt.
   Einwohnerzahlen können Schwellen nach § 46 NKomVG überschritten haben — Werte
   gegen die Bekanntmachungen der Wahlleitungen abgleichen. Fehlt eine Sitzzahl,
   sagt die Anwendung das sichtbar und rechnet nicht.
2. **Discovery testen**, sobald votemanager den Pfad `20260913` veröffentlicht.
   Wahlbereichszuschnitte, Ortsräte und angesetzte Direktwahlen stehen erst dann
   fest; erkannt wird alles dynamisch, hart verdrahtet sind nur die zwölf AGS.
3. **Deployment entscheiden** (siehe unten).

## Deployment

Bewusst offen gehalten. Der gesamte Netzabruf liegt hinter `ladeVertretung()`,
die Adapterwahl ist damit eine späte Entscheidung. Aktuell `adapter-auto`.

| | Cloudflare Pages | GitHub Pages |
|---|---|---|
| Serverseitige Routen | ja | nein, rein statisch |
| Datenaktualität | ~30 s | ~1–2 min (Poll + Deploy) |
| Umsetzung | `adapter-cloudflare` | `adapter-static` + langlaufender Actions-Job |
| Kosten | gratis | gratis (öffentliches Repo) |

Für einen Wahlabend ist Cloudflare technisch der bessere Weg. GitHub Pages
funktioniert, wenn alles an einem Ort bleiben soll — dann braucht es aber einen
langlaufenden `workflow_dispatch`-Job; ein `schedule`-Cron reicht nicht
(frühestens alle 5 Minuten, unter Last deutlich verspätet).

## Rücksicht auf fremde Infrastruktur

votemanager gehört uns nicht und hat keine zugesicherte API. Deshalb:
Ergebnisse werden 30 Sekunden zwischengespeichert, es laufen höchstens sechs
Anfragen gleichzeitig, und bei einem Ausfall zeigt die Anwendung den letzten
guten Stand mit deutlichem Hinweis statt einer Fehlerseite.
