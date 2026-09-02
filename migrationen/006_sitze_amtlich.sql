-- Die amtliche Sitzzahl beim Archivieren festhalten, statt sie je Abruf zu rechnen.
--
-- Die Zahl steht in `Komponente.sitze` jedes Endergebnisses; der Poller holt dieses
-- Dokument ohnehin, und die Nachernte existiert ausdrücklich dafür („genau ein
-- Dokument je Wahl: das Gesamtergebnis mit der amtlichen Sitzzahl", db.ts). Sie
-- danach in jedem Lesepfad erneut aus dem jsonb zu klauben, kostete zweierlei:
-- 315 ms je Neuaufbau der Übersicht, und in der Detailansicht zwei Abfragen *je
-- Vertretung* für die Sitzzahl der Vorwahl — weshalb die Übersicht die Vorwahl gar
-- nicht erst kannte (die vollständige Abfrage: 1,25 s je Neuaufbau für 2026).
--
-- Als Spalte ist beides ein Join. Erst dadurch lässt sich sitzzahlen.json
-- ersatzlos löschen: deren 53 Einträge waren zeichengleich zu dem, was das Archiv
-- ohnehin hergibt — nur mit dem falschen Etikett „hinterlegt" versehen.
ALTER TABLE wahl ADD COLUMN IF NOT EXISTS sitze_amtlich int;

-- Einmaliger Backfill über den Bestand.
--
-- Dies ist die EINZIGE Stelle, an der die Regel aus parseErgebnis()
-- (votemanager.ts) in SQL nachgebildet wird, und sie läuft genau einmal. Danach
-- pflegt ausschließlich der Poller die Spalte — über parseErgebnis() selbst.
-- Wer hier etwas anpasst, pflanzt eine zweite Wahrheit; die Regel gehört nach
-- votemanager.ts.
--
-- Gemessen: 5,3 s für 37.152 Wahlen.
UPDATE wahl w SET sitze_amtlich = q.sitze
FROM (
	SELECT w2.id,
		coalesce(
			(SELECT sum((coalesce(e->'sitze', e->'value', e->'zahl'))::text::numeric)::int
				FROM jsonb_array_elements(d.inhalt->'Komponente'->'sitze'->'tortenDiagramm'->'entries') e),
			-- Der replace entfernt deutsche Tausenderpunkte, wie parseZahl().
			nullif(replace(substring(d.inhalt->'Komponente'->'sitze'->>'hinweis' from '([0-9.]+)\s*Sitze'), '.', ''), '')::int
		) AS sitze
	FROM wahl w2
	JOIN termin t ON t.id = w2.termin_id
	JOIN instanz i ON i.id = t.instanz_id
	JOIN LATERAL (
		SELECT dd.inhalt FROM dokument dd JOIN pfad_stand p ON p.id = dd.pfad_stand_id
		WHERE p.instanz_id = i.id
			AND substring(p.pfad from '/wahl_[^/]+/[^/]+$') = '/wahl_' || w2.wahl_id || '/ergebnis_' || w2.gebiet_id || '_0.json'
		ORDER BY dd.id DESC LIMIT 1
	) d ON true
) q
WHERE q.id = w.id AND q.sitze IS NOT NULL;

-- Die Vorwahl sucht die jüngste frühere Wahl derselben Behörde, die eine Zahl hat.
CREATE INDEX IF NOT EXISTS wahl_sitze_amtlich_idx
	ON wahl (termin_id) WHERE sitze_amtlich IS NOT NULL;
