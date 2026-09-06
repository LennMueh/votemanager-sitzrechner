# Stil-Inventar des Frontend-CSS

Bestandsaufnahme aller `<style>`-Blöcke in `src/**/*.svelte`, Stand
06.09.2026. Reine Erhebung — es wurde nichts geändert.

Fundstellen stehen als `datei:zeile`; Pfade sind gegenüber `src/` gekürzt, wo
sie eindeutig bleiben.

## 1. CSS je Datei

„Zeilen CSS" zählt den Inhalt zwischen `<style>` und `</style>` ohne die Tags.

| Datei | Zeilen CSS | Zeilen gesamt |
|---|---:|---:|
| `src/routes/+page.svelte` | 238 | 512 |
| `src/lib/VertretungAnsicht.svelte` | 211 | 536 |
| `src/routes/bezirke/+page.svelte` | 201 | 441 |
| `src/routes/praesentation/+page.svelte` | 184 | 580 |
| `src/routes/+layout.svelte` | 181 | 210 |
| `src/lib/praesentation/SeiteKacheln.svelte` | 146 | 227 |
| `src/lib/praesentation/Buehne.svelte` | 111 | 245 |
| `src/lib/Wahlkalender.svelte` | 97 | 245 |
| `src/lib/Direktbalken.svelte` | 93 | 133 |
| `src/lib/praesentation/SeiteUebersicht.svelte` | 83 | 147 |
| `src/routes/v/+page.svelte` | 33 | 98 |
| `src/lib/Thema.svelte` | 29 | 79 |
| `src/lib/praesentation/SeiteDirektwahl.svelte` | 28 | 70 |
| `src/lib/Stimmverhaeltnis.svelte` | 21 | 74 |
| `src/lib/WahlAuswahl.svelte` | 15 | 149 |
| `src/routes/datenschutz/+page.svelte` | 14 | 36 |
| `src/routes/impressum/+page.svelte` | 14 | 36 |
| `src/routes/vergleich/+page.svelte` | 7 | 42 |
| `src/lib/Sitzdiagramm.svelte` | 0 | 102 |
| `src/routes/wahlen/+page.svelte` | 0 | 7 |
| **Summe** | **1706** | **3969** |

Zwei Dateien haben keinen `<style>`-Block:

- `Sitzdiagramm.svelte` zeichnet ein SVG und setzt Farbe und Strich über
  Attribute im Markup. Von den Tokens kommen dort nur `var(--text-3)` und
  `var(--flaeche)` als Attributwert für `fill` und `stroke`
  (`Sitzdiagramm.svelte:32`, `:35`, `:77`, `:78`).
- `wahlen/+page.svelte` ist eine Weiterleitung; die einzige Gestaltungsangabe
  ist ein Inline-`style="padding:2rem"` (`wahlen/+page.svelte:7`) — die einzige
  Stelle im Projekt, an der ein `style`-Attribut außerhalb eines
  `<style>`-Blocks eine feste Größe setzt. Sie fehlt deshalb in Abschnitt 2.

`+layout.svelte` ist die einzige Datei mit globalen Regeln: 181 Zeilen, davon
der Token-Block `:global(:root)` (`+layout.svelte:34–51`), die
Element-Grundlagen und die `.rechtstext`-Regeln für das über `{@html}`
eingespielte Markdown.

## 2. Werte für font-size, border-radius, padding und gap

| Eigenschaft | Deklarationen | verschiedene Schreibweisen |
|---|---:|---:|
| `font-size` | 87 | 43 |
| `gap` | 58 | 35 |
| `padding` | 56 | 42 |
| `border-radius` | 47 | 9 |

`border-radius` ist die einzige der vier Eigenschaften, die überwiegend über
Tokens läuft. Bei `padding` steht fast jeder Wert genau einmal da.

### 2.1 font-size

Zuerst die Gruppen, die dasselbe meinen, aber verschieden geschrieben sind:

| Wert | Schreibweisen | Summe |
|---|---|---:|
| 0,85 | `0.85rem` ×13, `.85em` ×2, `.85rem` ×1, `0.85em` ×1 | **17** |
| 0,9 | `0.9rem` ×10, `.9rem` ×1, `0.9em` ×1 | **12** |
| 0,8 | `0.8rem` ×7, `.8rem` ×4 | **11** |
| 0,82 | `0.82rem` ×3, `.82rem` ×2 | **5** |
| 0,95 | `0.95rem` ×2, `.95rem` ×1 | **3** |
| 0,75 | `.75rem` ×2 | 2 |

Die `em`-Fälle sind dabei nicht nur andere Schreibweise, sondern anderer Bezug:
`Stimmverhaeltnis.svelte:61`/`:62`, `Direktbalken.svelte:98` und
`+layout.svelte:194` rechnen relativ zum Elternelement, alle übrigen zur
Wurzel.

Vollständig, nach Häufigkeit:

| Wert | n | Fundstellen |
|---|---:|---|
| `0.85rem` | 13 | `VertretungAnsicht:370`, `:404`, `:414`, `:443`, `:512`, `bezirke:274`, `:332`, `:386`, `:407`, `+layout:127`, `+page:331`, `:356`, `v:82` |
| `0.9rem` | 10 | `VertretungAnsicht:365`, `:486`, `bezirke:252`, `:269`, `:311`, `datenschutz:34`, `impressum:34`, `+layout:114`, `praesentation:466`, `v:77` |
| `0.8rem` | 7 | `Thema:60`, `VertretungAnsicht:501`, `bezirke:323`, `+page:384`, `praesentation:485`, `:500`, `:505` |
| `.8rem` | 4 | `VertretungAnsicht:358`, `Wahlkalender:242`, `:244`, `+page:381` |
| `1.1rem` | 3 | `VertretungAnsicht:377`, `bezirke:280`, `praesentation:489` |
| `0.82rem` | 3 | `VertretungAnsicht:448`, `+page:427`, `:435` |
| `calc(1rem * var(--skala))` | 2 | `SeiteUebersicht:144`, `Stimmverhaeltnis:66` |
| `calc(1.5rem * var(--skala))` | 2 | `SeiteDirektwahl:51`, `SeiteUebersicht:86` |
| `calc(1.15rem * var(--skala))` | 2 | `Direktbalken:118`, `SeiteKacheln:107` |
| `calc(0.85rem * var(--skala))` | 2 | `Direktbalken:122`, `Buehne:208` |
| `calc(0.78rem * var(--skala))` | 2 | `SeiteKacheln:172`, `:219` |
| `.85em` | 2 | `Stimmverhaeltnis:61`, `:62` |
| `.82rem` | 2 | `Buehne:238`, `+page:379` |
| `.75rem` | 2 | `Wahlkalender:214`, `+page:315` |
| `1.05rem` | 2 | `Direktbalken:92`, `VertretungAnsicht:419` |
| `0.95rem` | 2 | `Buehne:201`, `:218` |
| `1.35rem` | 1 | `VertretungAnsicht:344` |
| `1.15rem` | 1 | `+layout:164` |
| `1rem` | 1 | `+layout:169` |
| `0.92rem` | 1 | `VertretungAnsicht:435` |
| `.95rem` | 1 | `Stimmverhaeltnis:70` |
| `0.9em` | 1 | `+layout:194` |
| `.9rem` | 1 | `+page:285` |
| `0.85em` | 1 | `Direktbalken:98` |
| `.85rem` | 1 | `VertretungAnsicht:349` |
| `.78rem` | 1 | `+page:301` |
| `.62rem` | 1 | `Wahlkalender:237` |

Dazu zehn `clamp()`, jedes genau einmal — `clamp(2rem, 5vw, 3.6rem)`
(`+page:297`), `clamp(1.8rem, 5vw, 2.8rem)` (`+page:350`),
`clamp(1.7rem, 4vw, 2.3rem)` (`+layout:159`), `clamp(1.6rem, 2.6vw, 2.6rem)`
(`Buehne:154`), `clamp(1.3rem, 3vw, 2rem)` (`+page:281`),
`clamp(1.2rem, 1.9vw, 1.9rem)` (`Buehne:175`), `clamp(1.15rem, 3vw, 1.5rem)`
(`bezirke:264`), `clamp(1.1rem, 2vw, 1.35rem)` (`WahlAuswahl:135`),
`clamp(0.9rem, 1.2vw, 1.25rem)` (`Buehne:161`), `clamp(0.8rem, 1vw, 1.05rem)`
(`Buehne:167`) — und sechs weitere `calc(… * var(--skala))` mit je einem
Vorkommen: `2rem` (`SeiteUebersicht:117`), `1.25rem` (`Direktbalken:121`),
`1.02rem` (`SeiteKacheln:162`), `0.95rem` (`SeiteKacheln:132`), `0.9rem`
(`SeiteDirektwahl:58`), `.78rem` (`SeiteDirektwahl:68`).

`calc(0.78rem * var(--skala))` und `calc(.78rem * var(--skala))` sind derselbe
Wert in zwei Schreibweisen (`SeiteKacheln:172`/`:219` gegen
`SeiteDirektwahl:68`).

### 2.2 border-radius

| Wert | n | Fundstellen |
|---|---:|---|
| `var(--radius)` | 14 | `Buehne:216`, `VertretungAnsicht:329`, `WahlAuswahl:134`, `Wahlkalender:166`, `+layout:112`, `+page:283`, `:319`, `:344`, `:364`, `:377`, `:405`, `:492`, `praesentation:417`, `vergleich:38` |
| `99px` | 12 | `Buehne:183`, `SeiteKacheln:116`, `:130`, `Stimmverhaeltnis:62`, `Thema:53`, `VertretungAnsicht:385`, `:441`, `bezirke:287`, `+page:441`, `:466`, `praesentation:486`, `:509` |
| `var(--radius-klein)` | 9 | `Stimmverhaeltnis:57`, `WahlAuswahl:137`, `:140`, `:146`, `Wahlkalender:156`, `:200`, `:220`, `bezirke:373`, `+layout:192` |
| `50%` | 7 | `SeiteKacheln:182`, `SeiteUebersicht:92`, `Stimmverhaeltnis:54`, `:55`, `:59`, `VertretungAnsicht:454`, `bezirke:395` |
| `calc(0.5rem * var(--skala))` | 1 | `SeiteKacheln:157` |
| `calc(0.35rem * var(--skala))` | 1 | `Direktbalken:119` |
| `0 calc(0.35rem * var(--skala)) calc(0.35rem * var(--skala)) 0` | 1 | `Direktbalken:120` |
| `0.3rem` | 1 | `Direktbalken:65` |
| `0 0.3rem 0.3rem 0` | 1 | `Direktbalken:72` |

`99px` ist der Pillenradius und steht in acht Dateien ohne Token daneben:
`Buehne`, `SeiteKacheln`, `Stimmverhaeltnis`, `Thema`, `VertretungAnsicht`,
`bezirke/+page`, `+page`, `praesentation/+page`. `--radius` (14 px) und
`--radius-klein` (9 px) decken ihn nicht ab; `Direktbalken` benutzt für den
Balken wieder eigene `0.3rem`.

### 2.3 padding

42 verschiedene Werte auf 56 Deklarationen. Nur fünf kommen mehr als einmal vor:

| Wert | n | Fundstellen |
|---|---:|---|
| `0` | 9 | `Direktbalken:43`, `SeiteKacheln:139`, `SeiteUebersicht:74`, `:138`, `Stimmverhaeltnis:56`, `VertretungAnsicht:427`, `WahlAuswahl:142`, `bezirke:355`, `+page:393` |
| `clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem) 4rem` | 4 | `bezirke:243`, `datenschutz:25`, `impressum:25`, `v:68` |
| `2rem` | 2 | `+page:492`, `praesentation:555` |
| `1rem` | 2 | `+page:377`, `vergleich:38` |
| `0.4rem 0.5rem` | 2 | `VertretungAnsicht:494`, `bezirke:316` |

Die übrigen 37 stehen genau einmal. Sie ballen sich um wenige Größen, ohne sie
zu treffen — die vertikale Komponente der Knopf- und Badge-Polster:

| ungefähr | belegte Werte |
|---|---|
| 0,55 rem | `.55rem .9rem` (`WahlAuswahl:146`), `.55rem .85rem` (`WahlAuswahl:140`), `.55rem .8rem` (`+page:380`), `.55rem .7rem` (`Stimmverhaeltnis:57`), `0.55rem 0.95rem` (`+page:323`), `0.55rem clamp(.75rem, 2.5vw, 2rem)` (`praesentation:462`) |
| 0,35–0,45 rem | `0.45rem 0.75rem` (`Thema:62`), `.45rem .65rem` (`Wahlkalender:154`), `0.4rem 0.5rem` (`VertretungAnsicht:494`, `bezirke:316`), `0.35rem 0.8rem` (`Buehne:217`), `0.35rem 0.7rem` (`praesentation:484`), `0.35rem 0.5rem` (`praesentation:507`), `.35rem` (`Wahlkalender:244`) |
| 0,6–0,85 rem | `0.85rem 1rem` (`+page:403`), `.65rem .75rem` (`WahlAuswahl:137`), `.65rem .25rem` (`WahlAuswahl:144`), `0.7rem 0.9rem` (`+page:362`), `0.6rem 0.9rem` (`+layout:113`), `0.5rem 0.9rem` (`praesentation:416`) |
| Nullhöhe | `0 0.5rem` (`+page:442`), `0 0.45rem` (`VertretungAnsicht:442`), `0 .45rem` (`Stimmverhaeltnis:62`), `0 calc(0.5rem * var(--skala))` (`SeiteKacheln:131`) |

`0 0.45rem` und `0 .45rem` sind derselbe Wert in zwei Schreibweisen.

Seitenrahmen (`main` und die Bühne), je einmal:
`clamp(1.25rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem) 5rem` (`+page:277`),
`clamp(1rem, 4vw, 3rem) 1rem 4rem` (`vergleich:35`),
`2rem 1.25rem 4rem` (`praesentation:399`),
`1.25rem clamp(1rem, 3vw, 1.5rem) 2rem` (`+layout:120`),
`clamp(.8rem, 2.5vw, 1.4rem) clamp(.75rem, 3vw, 2rem) 1rem` (`Buehne:138`).

Einzelwerte: `clamp(1rem, 3vw, 1.75rem)` (`VertretungAnsicht:330`),
`clamp(1rem, 3vw, 1.5rem)` (`+page:345`), `clamp(1rem, 2vw, 1.5rem)`
(`WahlAuswahl:134`), `1.25rem` (`+page:283`), `.75rem` (`Wahlkalender:170`),
`.5rem` (`vergleich:39`), `0.1rem 0.45rem` (`bezirke:371`), `0.1em 0.35em`
(`+layout:193`), `calc(.32rem * var(--skala)) calc(.55rem * var(--skala))`
(`Stimmverhaeltnis:66`) und
`calc(0.32rem * var(--skala)) calc(0.6rem * var(--skala))` (`SeiteKacheln:158`)
— die letzten beiden wieder derselbe Ansatz in zwei Schreibweisen.

Longhands daneben: `padding-top` ×4 (`VertretungAnsicht:356`, `:409`,
`+page:494`, `praesentation:563`), `padding-left` ×3 (`+layout:185`,
`+page:334`, `v:85`), `padding-block` ×2 (`Buehne:242`, `praesentation:574`),
`padding-inline` ×1 (`praesentation:489`).

### 2.4 gap

Gruppen gleicher Bedeutung:

| Wert | Schreibweisen | Summe |
|---|---|---:|
| 0,4 | `0.4rem` ×5, `.4rem` ×2 | **7** |
| 0,75 | `.75rem` ×3, `0.75rem` ×1 | **4** |
| 0,35 | `.35rem` ×2, `0.35rem` ×1 | **3** |
| 0,45 | `.45rem` ×3 | 3 |
| 0,3 | `.3rem` ×2 | 2 |
| 0,5 | `0.5rem` ×2 | 2 |

Vollständig, nach Häufigkeit:

| Wert | n | Fundstellen |
|---|---:|---|
| `1rem` | 7 | `VertretungAnsicht:337`, `bezirke:259`, `+page:282`, `:291`, `praesentation:406`, `:461`, `vergleich:37` |
| `0.4rem` | 5 | `Direktbalken:127`, `VertretungAnsicht:434`, `bezirke:351`, `:411`, `+page:396` |
| `.75rem` | 3 | `WahlAuswahl:139`, `+page:375`, `:376` |
| `.45rem` | 3 | `Stimmverhaeltnis:56`, `+page:283`, `praesentation:565` |
| `0.6rem` | 3 | `Buehne:139`, `+page:312`, `:434` |
| `calc(0.9rem * var(--skala))` | 2 | `Direktbalken:118`, `SeiteDirektwahl:46` |
| `calc(0.5rem * var(--skala))` | 2 | `SeiteKacheln:154`, `SeiteUebersicht:85` |
| `calc(0.28rem * var(--skala))` | 2 | `SeiteKacheln:141`, `:170` |
| `.4rem` | 2 | `Wahlkalender:152`, `+page:510` |
| `.3rem` | 2 | `Wahlkalender:243`, `+page:378` |
| `.35rem` | 2 | `Buehne:242`, `praesentation:481` |
| `0.5rem` | 2 | `Direktbalken:45`, `+page:341` |
| `2rem` | 1 | `Buehne:149` |
| `1.5rem` | 1 | `Stimmverhaeltnis:53` |
| `1.25rem` | 1 | `+layout:133` |
| `0.75rem` | 1 | `Direktbalken:52` |
| `.65rem` | 1 | `WahlAuswahl:136` |
| `0.35rem` | 1 | `praesentation:494` |
| `.25rem` | 1 | `Wahlkalender:192` |
| `.2rem` | 1 | `+page:315` |
| `.15rem` | 1 | `Wahlkalender:212` |

Zweiwertige `gap` (Zeile/Spalte): `0.5rem 1.25rem` (`+layout:124`),
`0.4rem 1.1rem` (`VertretungAnsicht:426`), `0.3rem 1rem` (`+page:402`),
`0.25rem 1.5rem` (`bezirke:405`), `.45rem .7rem` (`Stimmverhaeltnis:57`),
`calc(1rem * var(--skala)) calc(1.1rem * var(--skala))` (`SeiteKacheln:94`),
`calc(0.5rem * var(--skala)) calc(1.8rem * var(--skala))`
(`SeiteUebersicht:78`).

Weitere `calc(… * var(--skala))` mit je einem Vorkommen: `2rem`
(`Stimmverhaeltnis:63`), `1rem` (`SeiteUebersicht:68`), `0.6rem`
(`Direktbalken:117`), `0.45rem` (`SeiteKacheln:106`), `0.4rem`
(`Direktbalken:128`), `.4rem` (`Stimmverhaeltnis:65`), `0.25rem`
(`SeiteUebersicht:141`). `calc(0.4rem * var(--skala))` und
`calc(.4rem * var(--skala))` sind wieder dasselbe in zwei Schreibweisen.

## 3. Variablen ohne Definition in `:global(:root)`

`+layout.svelte:34–51` definiert 15 Tokens:

`--flaeche`, `--flaeche-2`, `--rand`, `--text`, `--text-2`, `--text-3`,
`--akzent`, `--warn`, `--warn-flaeche`, `--gut`, `--auf-akzent`, `--schatten`,
`--radius`, `--radius-klein`, `--inhalt`.

Alle 15 werden benutzt. Darüber hinaus stehen drei `var(--…)` im Code, die dort
nicht definiert sind:

| Variable | Verwendungen | Dateien | Wo sie herkommt |
|---|---:|---:|---|
| `--skala` | 61 | 6 | lokal auf `.buehne` gesetzt (`Buehne.svelte:224`, `--skala: 1`) und zur Laufzeit über `el.style.setProperty` überschrieben (`Buehne.svelte:41`) |
| `--farbe` | 7 | 3 | je Element im Markup über `style:--farbe={…}`: `SeiteKacheln.svelte:49`, `SeiteUebersicht.svelte:38`, `VertretungAnsicht.svelte:212` und `:276` |
| `--gedaempft` | 1 | 1 | **nirgends definiert** |

### `--skala`

Kein Fehler, aber eine Abhängigkeit ohne Zusicherung: `Direktbalken.svelte`,
`SeiteDirektwahl.svelte`, `SeiteKacheln.svelte`, `SeiteUebersicht.svelte` und
`Stimmverhaeltnis.svelte` rechnen mit `var(--skala)`, ohne einen Fallback
anzugeben. Steht keine `.buehne` im Vorfahrenpfad, ist der `calc()`-Ausdruck
ungültig und die Deklaration fällt aus. `Direktbalken` und `Stimmverhaeltnis`
werden auch außerhalb des Präsentationsmodus verwendet — dort greifen die
`.gross`-Regeln allerdings ohnehin nicht.

### `--farbe`

Die Fallback-Behandlung ist uneinheitlich:

| Stelle | Schreibweise |
|---|---|
| `SeiteUebersicht.svelte:105`, `:109` | `var(--farbe, var(--text-3))` |
| `VertretungAnsicht.svelte:471`, `:475` | `var(--farbe, var(--text-3))` |
| `SeiteKacheln.svelte:115`, `:198`, `:201` | `var(--farbe)` — ohne Fallback |

In `SeiteKacheln` ist das gedeckt, weil das Markup an derselben Stelle
`style:--farbe={g.farbe ?? 'var(--text-3)'}` setzt (`SeiteKacheln.svelte:49`) —
der Ersatzwert steht also im Skript statt im CSS.

### `--gedaempft`

`VertretungAnsicht.svelte:352`:

```css
.grundlage { color: var(--gedaempft, #666); }
```

`--gedaempft` kommt in keiner `.svelte`-, `.ts`-, `.css`- oder `.html`-Datei des
Projekts als Definition vor. Die Regel greift damit immer auf `#666` zurück —
eine feste Farbe ohne Dunkelmodus-Gegenstück (siehe Abschnitt 4).

## 4. Hex- und rgb()-Farben außerhalb von `+layout.svelte`

`rgb()`, `rgba()`, `hsl()` und Farbnamen kommen außerhalb von `+layout.svelte`
nicht vor. `+layout.svelte` selbst führt zwei `rgb()` im `--schatten` und ein
`white` im Fokusring (`+layout.svelte:47`, `:96`).

Drei Fundstellen mit Hex-Farben:

| Farbe | Fundstellen | Token mit demselben Wert |
|---|---|---|
| `#2e7d32` | `VertretungAnsicht.svelte:397`, `bezirke/+page.svelte:297`, `+page.svelte:477` | **`--gut`** — `light-dark(#2e7d32, #6cc070)` (`+layout.svelte:45`) |
| `#666` | `VertretungAnsicht.svelte:352` | keins exakt; am nächsten `--text-3` = `light-dark(#767d87, #868e9a)` (`+layout.svelte:41`) |
| `#3366cc`, `#dc3912`, `#ff9900`, `#109618`, `#990099`, `#0099c6`, `#dd4477`, `#66aa00` | `Stimmverhaeltnis.svelte:14` | keins — siehe unten |

### `#2e7d32`

Dreimal dieselbe Regel, dreimal derselbe Zweck — der fertig ausgezählte
Fortschrittsbalken:

```css
.balken div.fertig  { background: #2e7d32; }   /* VertretungAnsicht.svelte:396 */
.balken div.fertig  { background: #2e7d32; }   /* bezirke/+page.svelte:296 */
.balken span.fertig { background: #2e7d32; }   /* +page.svelte:476 */
```

Der Wert ist zeichengleich mit dem Hellmodus-Anteil von `--gut`. Weil die
Kopien den `light-dark()`-Ausdruck nicht mitnehmen, bleibt der Balken im
Dunkelmodus beim dunklen Grün `#2e7d32` statt auf `#6cc070` zu wechseln.
Für denselben Balken im Präsentationsmodus steht das Token da:
`Buehne.svelte:195` schreibt `background: var(--gut)`. Weitere Verwendungen des
Tokens: `Direktbalken.svelte:107` (Umriss eines gewählten Bewerbers),
`bezirke/+page.svelte:377` und `:378`.

### `#666`

Fallback der nirgends definierten Variable `--gedaempft`
(`VertretungAnsicht.svelte:352`). Der Wert liegt zwischen `--text-2`
(`#4a5058`) und `--text-3` (`#767d87`) und hat ebenfalls keinen
Dunkelmodus-Anteil.

### Die acht Farben in `Stimmverhaeltnis.svelte:14`

```js
const ersatzfarben = ['#3366cc', '#dc3912', '#ff9900', '#109618',
                      '#990099', '#0099c6', '#dd4477', '#66aa00'];
```

Kein Gestaltungswert, sondern Daten: die Ersatzpalette für Wahlvorschläge, für
die votemanager keine Farbe liefert (`Stimmverhaeltnis.svelte:16`). Ein Token
mit demselben Wert gibt es nicht und könnte es auch nicht geben — die Palette
muss acht unterscheidbare Werte führen, die Tokens führen Rollen.

## 5. Selektoren, die in mehreren Dateien dieselbe Sache stylen

### `.zurueck` — 6 Dateien, davon 4 zeichengleich

| Datei | Regel |
|---|---|
| `bezirke/+page.svelte:246` | `display:inline-flex; align-items:center; min-height:44px; margin-bottom:1.25rem; text-decoration:none; font-size:0.9rem` |
| `datenschutz/+page.svelte:28` | identisch |
| `impressum/+page.svelte:28` | identisch |
| `v/+page.svelte:71` | identisch |
| `+page.svelte:380` | `min-height:44px; padding:.55rem .8rem` |
| `vergleich/+page.svelte:36` | `display:inline-flex; min-height:44px; align-items:center` |

Vier wortgleiche Kopien, zwei Abweichler. Gemeinsam ist allen nur
`min-height: 44px` (die Touch-Zielgröße).

### `main` — 6 Dateien, gleiche Struktur, vier Maße

| Datei | `max-width` | `padding` |
|---|---|---|
| `+page.svelte:274` | `var(--inhalt)` | `clamp(1.25rem, 4vw, 3rem) clamp(1rem, 3vw, 2rem) 5rem` |
| `vergleich/+page.svelte:35` | `var(--inhalt)` | `clamp(1rem, 4vw, 3rem) 1rem 4rem` |
| `bezirke/+page.svelte:240` | `1120px` | `clamp(1rem, 3vw, 2rem) clamp(1rem, 3vw, 1.5rem) 4rem` |
| `datenschutz/+page.svelte:22` | `46rem` | dasselbe |
| `impressum/+page.svelte:22` | `46rem` | dasselbe |
| `v/+page.svelte:65` | `980px` | dasselbe |

`margin: 0 auto` in allen sechs. `1120px` in `bezirke` ist zeichengleich mit
`--inhalt` (`+layout.svelte:50`), nur eben ohne Token. `46rem` und `980px` sind
gewollt engere Textspalten.

### `.balken` — 5 Dateien, zwei verschiedene Dinge

`Direktbalken.svelte:40` ist die Hülle einer Kandidatenliste
(`list-style:none; display:grid; gap:0.5rem`) und hat mit den übrigen nichts zu
tun außer dem Namen.

Die anderen vier sind der Auszählungs-Fortschrittsbalken:

| Datei | `height` | Rest |
|---|---|---|
| `VertretungAnsicht.svelte:381` | `7px` | `background:var(--flaeche-2); border:1px solid var(--rand); border-radius:99px; overflow:hidden; margin:0.4rem 0 0.25rem` |
| `bezirke/+page.svelte:283` | `7px` | identisch zu `VertretungAnsicht` |
| `Buehne.svelte:179` | `8px` | wie oben, aber `margin-top:0.35rem` |
| `+page.svelte:462` | `4px` | ohne `border`, mit `grid-column: 1 / -1` |

Dazu die Kindregeln: `.balken div` in `Buehne:188`, `VertretungAnsicht:390`,
`bezirke:291`; `.balken div.fertig` in `Buehne:194`, `VertretungAnsicht:396`,
`bezirke:296` — wobei `Buehne` `var(--gut)` benutzt und die beiden anderen
`#2e7d32` (Abschnitt 4).

### `.stand` — 4 Dateien

| Datei | Regel |
|---|---|
| `VertretungAnsicht.svelte:368` | `text-align:right; font-size:0.85rem; color:var(--text-2); min-width:190px` |
| `bezirke/+page.svelte:272` | identisch |
| `Buehne.svelte:164` | `text-align:right; color:var(--text-2); font-size:clamp(0.8rem,1vw,1.05rem); min-width:15rem; flex:none` |
| `+page.svelte:458` | `white-space:nowrap` — anderes Element |

Zwei zeichengleiche Kopien, eine skalierte Variante, ein Namensvetter.
`.stand strong` steht dreimal (`Buehne:172`, `VertretungAnsicht:375`,
`bezirke:278`).

### `.laedt` und `main[aria-busy='true']` — identische Kopien

`.laedt { color: var(--text-2) }` in `bezirke:420`, `+page:480`, `v:88`;
`praesentation:553` ergänzt `padding: 2rem`.

`main[aria-busy='true'] { opacity:0.55; transition:opacity 0.15s ease }` steht
wortgleich in `bezirke:423`, `+page:487`, `v:94`.

### `.marke` — 3 Dateien, 3 verschiedene Dinge

| Datei | Was es ist |
|---|---|
| `SeiteKacheln.svelte:179` | runder Punkt, `border-radius:50%`, `var(--text-2)` |
| `bezirke/+page.svelte:369` | Badge mit `var(--radius-klein)` und `var(--flaeche-2)` |
| `+page.svelte:439` | Badge mit `99px`, ohne Füllung |

### `.kopf` und `.leiste` — Namenskollisionen

`.kopf` in `Wahlkalender.svelte:188` ist das Monatsnavigations-Raster
(`display:grid`, 5 Spalten), in `praesentation/+page.svelte:402` eine
Flex-Kopfzeile. Nichts gemeinsam außer `align-items: center`.

`.leiste` in `SeiteUebersicht.svelte:71` ist eine zentrierte Legendenliste, in
`praesentation/+page.svelte:453` die am unteren Rand fixierte Bedienleiste.

### Weitere Mehrfachnennungen

Selektoren, die in mehr als einer Datei vorkommen, ohne dass es dieselbe Sache
wäre — der Vollständigkeit halber:

`.punkt` (`SeiteUebersicht:89`, `Stimmverhaeltnis:59`, `VertretungAnsicht:451`,
`bezirke:392`; `.punkt.leer` in `SeiteUebersicht:102` und
`VertretungAnsicht:468`, dort gleichbedeutend), `.klein`
(`VertretungAnsicht:510`, `bezirke:330`, `+page:354`), `.legende`
(`SeiteDirektwahl:68`, `VertretungAnsicht:349`/`:422`), `.tabelle`
(`VertretungAnsicht:489`, `bezirke:303`), `.beteiligung`
(`VertretungAnsicht:406`, `bezirke:299`), `.behoerde` (`VertretungAnsicht:362`,
`bezirke:266`), `.fussnote` (`Buehne:205`, `bezirke:344`), `.name`
(`Direktbalken:55`, `SeiteUebersicht:112`, `Stimmverhaeltnis:60`), `.stimmen`
(`Direktbalken:95`, `Stimmverhaeltnis:61`), `.los` (`SeiteDirektwahl:56`,
`SeiteUebersicht:136`), `.leer` (`Wahlkalender:225`, `+page:492`),
`.zwischenstand` (`Buehne:198`, `VertretungAnsicht:412`), `.vergleich`
(`+page:381`, `vergleich:37`), `.unter` (`+page:303`, `praesentation:409`),
`.r` (`VertretungAnsicht:506`, `bezirke:327`), `.gross` (`Direktbalken:117`,
`Stimmverhaeltnis:63`), `.seite` (`SeiteDirektwahl:42`, `SeiteUebersicht:64`).

Elementselektoren mehrfach: `header` (4 Dateien), `h2` (5), `li` (4), `ul` (4),
`table`/`td`/`th` (je 2), `button` (3), `section` (2), `h1` (2).
