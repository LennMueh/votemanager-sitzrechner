CREATE TABLE IF NOT EXISTS uebersicht_ebene (
	id bigserial PRIMARY KEY,
	instanz_id bigint NOT NULL REFERENCES instanz(id) ON DELETE CASCADE,
	wahl_id text NOT NULL,
	ebene_id text NOT NULL,
	name text NOT NULL,
	art text NOT NULL CHECK (art IN ('wahlbereich', 'wahlbezirk', 'sonstige')),
	UNIQUE (instanz_id, wahl_id, ebene_id)
);

CREATE TABLE IF NOT EXISTS gebiet (
	id bigserial PRIMARY KEY,
	uebersicht_ebene_id bigint NOT NULL REFERENCES uebersicht_ebene(id) ON DELETE CASCADE,
	gebiet_id text NOT NULL,
	name text NOT NULL,
	UNIQUE (uebersicht_ebene_id, gebiet_id)
);

CREATE INDEX IF NOT EXISTS gebiet_id_idx ON gebiet (gebiet_id);
