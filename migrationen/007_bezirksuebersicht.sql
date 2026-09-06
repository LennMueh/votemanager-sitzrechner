-- Wahlbezirks-Übersichten wieder heraufstufen: /bezirke liest genau dieses eine
-- Dokument je Wahl, es trägt Stand und Ergebnis aller Wahllokale. 004 hatte es
-- mit den hunderten Bezirks-Ergebnissen zusammen auf 45 gestellt; die bleiben
-- dort, denn sie werden nur beim Aufklappen einer Zeile gebraucht.
--
-- right(...) statt LIKE: '_' ist in LIKE ein Ein-Zeichen-Platzhalter, das Muster
-- '%/uebersicht_' || ebene_id || '_0.json' griffe also zu weit.
UPDATE pfad_stand p SET prioritaet = 70
FROM uebersicht_ebene e
WHERE e.instanz_id = p.instanz_id AND e.art = 'wahlbezirk'
	AND right(p.pfad, length('/uebersicht_' || e.ebene_id || '_0.json'))
		= '/uebersicht_' || e.ebene_id || '_0.json'
	AND p.prioritaet <> 70;
