-- Prioritäten der bestehenden Pfade auf das Schema aus db.ts nachziehen.
-- Neue INSERTs vergeben sie schon richtig; ohne diese Migration behielten die
-- bereits angelegten Pfade der Wahl vom 13.09.2026 ihre alten Werte, und das
-- Gesamtergebnis stünde am Wahlabend wieder unter den Wahlbereichen.

-- Stimmbezirks-Übersichten herunterstufen; die Rechenschicht liest sie nie.
-- Bewusst nur 'wahlbezirk': von 254 Ebenen sind nur 2 als 'wahlbereich' erkannt,
-- 35 heißen „Mitgliedsgemeinden". Bis geklärt ist, ob das bei Samtgemeinden die
-- Wahlbereiche nach § 36 sind, bleiben sie heiß.
--
-- right(...) statt LIKE: '_' ist in LIKE ein Ein-Zeichen-Platzhalter, das
-- Muster '%/uebersicht_' || ebene_id || '_0.json' greift also zu weit.
UPDATE pfad_stand p SET prioritaet = 45
FROM uebersicht_ebene e
WHERE e.instanz_id = p.instanz_id AND e.art = 'wahlbezirk'
	AND right(p.pfad, length('/uebersicht_' || e.ebene_id || '_0.json'))
		= '/uebersicht_' || e.ebene_id || '_0.json'
	AND p.prioritaet <> 45;

-- Deren Gebiets-Ergebnisse ebenso. Der Filter auf 85 schützt das
-- Gesamtergebnis, das mit 80 angelegt wurde und gleich hochgestuft wird.
UPDATE pfad_stand p SET prioritaet = 45
FROM gebiet g JOIN uebersicht_ebene e ON e.id = g.uebersicht_ebene_id
WHERE e.instanz_id = p.instanz_id AND e.art = 'wahlbezirk'
	AND right(p.pfad, length('/ergebnis_' || g.gebiet_id || '_0.json'))
		= '/ergebnis_' || g.gebiet_id || '_0.json'
	AND p.prioritaet = 85;

-- Das Gesamtergebnis der Vertretung über alle Unter-Gebiete heben: ohne dieses
-- eine Dokument bricht berechneVertretung() ab.
UPDATE pfad_stand p SET prioritaet = 90
FROM wahl w JOIN termin t ON t.id = w.termin_id
WHERE t.instanz_id = p.instanz_id
	AND right(p.pfad, length('/wahl_' || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json'))
		= '/wahl_' || w.wahl_id || '/ergebnis_' || w.gebiet_id || '_0.json'
	AND p.prioritaet <> 90;
