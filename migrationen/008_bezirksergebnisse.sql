-- Einzelergebnisse der Wahllokale von 45 auf 60. /bezirke baut seine Spalten
-- aus ihnen: die Bezirksübersicht des Hosts kürzt auf die vier stärksten
-- Wahlvorschläge der ganzen Wahl plus „Sonstige" und verdeckt damit
-- Wahlvorschläge, die in einem Gebiet angetreten sind (Samtgemeinderat
-- Bardowick: drei), während sie andere zeigt, die dort nicht wählbar waren.
--
-- Vertretbar trotz hunderter Pfade je Wahl, weil ein Wahllokal-Ergebnis nach
-- seiner Schnellmeldung nicht mehr wechselt: einmal mit Nutzlast, danach nur
-- noch 304er über ETag.
--
-- right(...) statt LIKE: '_' ist in LIKE ein Ein-Zeichen-Platzhalter.
UPDATE pfad_stand p SET prioritaet = 60
FROM gebiet g JOIN uebersicht_ebene e ON e.id = g.uebersicht_ebene_id
WHERE e.instanz_id = p.instanz_id AND e.art = 'wahlbezirk'
	AND right(p.pfad, length('/ergebnis_' || g.gebiet_id || '_0.json'))
		= '/ergebnis_' || g.gebiet_id || '_0.json'
	AND p.prioritaet = 45;
