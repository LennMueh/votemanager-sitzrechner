-- Drei Indizes gegen drei gemessene Vollscans über pfad_stand (553.306 Zeilen).

-- 1. Ergebnisdokumente über den Pfadsuffix statt über LIKE '%…' finden.
--
-- Der Anfang eines Pfades sieht je Anbieter anders aus (komm.one, ego-saar,
-- votemanager.kdo.de), die letzten beiden Segmente sind überall gleich gebaut:
-- /wahl_<wahlId>/ergebnis_<gebietId>_0.json. Gesucht wurde bisher mit führendem
-- Platzhalter, den kein Index bedienen kann — in der Übersicht kostete das
-- 3,4 der 16 Sekunden, ohne die Suchmuster braucht dieselbe Abfrage 23 ms.
--
-- Der Ausdruck muss zeichengleich zu wahlpfad() in daten.ts sein, sonst greift
-- der Index nicht.
CREATE INDEX IF NOT EXISTS pfad_stand_wahlpfad_idx
	ON pfad_stand (instanz_id, substring(pfad from '/wahl_[^/]+/[^/]+$'));

-- 2. „Läuft bei dieser Instanz gerade eine Wahl?" in faellige().
-- Sonst ein paralleler Seq Scan über alle Pfade, um ein paar Dutzend zu finden.
CREATE INDEX IF NOT EXISTS pfad_stand_live_idx
	ON pfad_stand (instanz_id) WHERE zustand IN ('vorlauf', 'wahlabend');

-- 3. strukturGeladen in faellige(): dieselbe Lage, hier für die wahl.json.
CREATE INDEX IF NOT EXISTS pfad_stand_struktur_idx
	ON pfad_stand (instanz_id) WHERE pfad LIKE '%/wahl.json' AND status IS NOT NULL;
