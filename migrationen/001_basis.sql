CREATE TABLE IF NOT EXISTS behoerde (
	id bigserial PRIMARY KEY,
	kennung text NOT NULL UNIQUE,
	name text NOT NULL,
	land char(2) NOT NULL,
	regionalschluessel text,
	url text NOT NULL,
	aktiv boolean NOT NULL DEFAULT true,
	aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS instanz (
	id bigserial PRIMARY KEY,
	behoerde_id bigint NOT NULL REFERENCES behoerde(id) ON DELETE CASCADE,
	termin_url text NOT NULL,
	api_wurzel text,
	zustand text NOT NULL DEFAULT 'geplant' CHECK (zustand IN ('geplant', 'vorlauf', 'wahlabend', 'nachlauf', 'beobachtung', 'ruhend', 'unerreichbar')),
	naechste_pruefung timestamptz,
	prioritaet integer NOT NULL DEFAULT 100,
	fehler_anzahl integer NOT NULL DEFAULT 0 CHECK (fehler_anzahl >= 0),
	aktualisiert_am timestamptz NOT NULL DEFAULT now(),
	UNIQUE (behoerde_id, termin_url)
);

CREATE INDEX IF NOT EXISTS instanz_faellig_idx
	ON instanz (prioritaet, naechste_pruefung)
	WHERE zustand <> 'ruhend';

CREATE TABLE IF NOT EXISTS termin (
	id bigserial PRIMARY KEY,
	instanz_id bigint NOT NULL REFERENCES instanz(id) ON DELETE CASCADE,
	termin_id text NOT NULL,
	name text NOT NULL,
	datum date NOT NULL,
	UNIQUE (instanz_id, termin_id)
);

CREATE TABLE IF NOT EXISTS wahl (
	id bigserial PRIMARY KEY,
	termin_id bigint NOT NULL REFERENCES termin(id) ON DELETE CASCADE,
	wahl_id text NOT NULL,
	gebiet_id text NOT NULL,
	gebiet_name text NOT NULL,
	name text NOT NULL,
	wahlart text,
	UNIQUE (termin_id, wahl_id, gebiet_id)
);

CREATE TABLE IF NOT EXISTS pfad_stand (
	id bigserial PRIMARY KEY,
	instanz_id bigint NOT NULL REFERENCES instanz(id) ON DELETE CASCADE,
	pfad text NOT NULL,
	etag text,
	last_modified text,
	zuletzt_geprueft timestamptz,
	zuletzt_geaendert timestamptz,
	zustand text NOT NULL DEFAULT 'geplant',
	prioritaet integer NOT NULL DEFAULT 0,
	naechste_pruefung timestamptz,
	fehler_anzahl integer NOT NULL DEFAULT 0 CHECK (fehler_anzahl >= 0),
	status integer,
	fehler text,
	UNIQUE (instanz_id, pfad)
);

CREATE INDEX IF NOT EXISTS pfad_stand_faellig_idx
	ON pfad_stand (prioritaet DESC, naechste_pruefung)
	WHERE naechste_pruefung IS NOT NULL;

CREATE TABLE IF NOT EXISTS dokument (
	id bigserial PRIMARY KEY,
	pfad_stand_id bigint NOT NULL REFERENCES pfad_stand(id) ON DELETE CASCADE,
	sha256 char(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
	inhalt jsonb NOT NULL,
	erfasst_am timestamptz NOT NULL DEFAULT now(),
	UNIQUE (pfad_stand_id, sha256)
);

CREATE INDEX IF NOT EXISTS dokument_pfad_neu_idx
	ON dokument (pfad_stand_id, erfasst_am DESC);

CREATE TABLE IF NOT EXISTS host_stand (
	host text PRIMARY KEY,
	naechster_abruf timestamptz,
	fehler_anzahl integer NOT NULL DEFAULT 0 CHECK (fehler_anzahl >= 0),
	zuletzt_erreichbar timestamptz,
	letzter_fehler text,
	aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cache (
	schluessel text PRIMARY KEY,
	wert jsonb NOT NULL,
	laeuft_ab timestamptz NOT NULL,
	aktualisiert_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cache_laeuft_ab_idx ON cache (laeuft_ab);

CREATE TABLE IF NOT EXISTS ereignis (
	id bigserial PRIMARY KEY,
	schluessel text NOT NULL,
	dokument_id bigint REFERENCES dokument(id) ON DELETE SET NULL,
	daten jsonb NOT NULL DEFAULT '{}'::jsonb,
	erzeugt_am timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ereignis_schluessel_id_idx ON ereignis (schluessel, id);

CREATE OR REPLACE FUNCTION melde_ereignis() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	PERFORM pg_notify('wahlergebnis', NEW.id::text);
	RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ereignis_melden ON ereignis;
CREATE TRIGGER ereignis_melden
	AFTER INSERT ON ereignis
	FOR EACH ROW EXECUTE FUNCTION melde_ereignis();
