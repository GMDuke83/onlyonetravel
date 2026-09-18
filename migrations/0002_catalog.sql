CREATE TABLE partners (
 id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)),
 version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, actor TEXT NOT NULL
);
CREATE TABLE services (
 id TEXT PRIMARY KEY, partner_id TEXT NOT NULL REFERENCES partners(id),
 data TEXT NOT NULL CHECK(json_valid(data)), version INTEGER NOT NULL DEFAULT 1,
 updated_at INTEGER NOT NULL, actor TEXT NOT NULL
);
CREATE INDEX services_partner ON services(partner_id);
CREATE TABLE catalog_events (
 id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, record_id TEXT NOT NULL,
 version INTEGER NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL, actor TEXT NOT NULL
);
CREATE TRIGGER partner_created AFTER INSERT ON partners BEGIN
 INSERT INTO catalog_events(kind,record_id,version,data,at,actor) VALUES('partner',NEW.id,NEW.version,NEW.data,NEW.updated_at,NEW.actor); END;
CREATE TRIGGER partner_updated AFTER UPDATE ON partners BEGIN
 INSERT INTO catalog_events(kind,record_id,version,data,at,actor) VALUES('partner',NEW.id,NEW.version,NEW.data,NEW.updated_at,NEW.actor); END;
CREATE TRIGGER service_created AFTER INSERT ON services BEGIN
 INSERT INTO catalog_events(kind,record_id,version,data,at,actor) VALUES('service',NEW.id,NEW.version,NEW.data,NEW.updated_at,NEW.actor); END;
CREATE TRIGGER service_updated AFTER UPDATE ON services BEGIN
 INSERT INTO catalog_events(kind,record_id,version,data,at,actor) VALUES('service',NEW.id,NEW.version,NEW.data,NEW.updated_at,NEW.actor); END;
