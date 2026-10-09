CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','admin','manager','sales','operations','finance','readonly')), token_hash TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, created_by TEXT NOT NULL);
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE TABLE audit_events (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, actor TEXT NOT NULL, entity_id TEXT, at INTEGER NOT NULL);
CREATE TABLE quote_versions (request_id TEXT NOT NULL REFERENCES requests(id), version INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)), created_at INTEGER NOT NULL, created_by TEXT NOT NULL, PRIMARY KEY(request_id,version));
CREATE TRIGGER quote_initial AFTER INSERT ON requests WHEN json_type(NEW.data,'$.offer')='object' BEGIN
 INSERT INTO quote_versions VALUES(NEW.id,1,json_extract(NEW.data,'$.offer'),NEW.updated_at,NEW.actor);
END;
CREATE TRIGGER quote_revised AFTER UPDATE ON requests WHEN json_type(NEW.data,'$.offer')='object' AND coalesce(json_extract(OLD.data,'$.offer'),'null')<>json_extract(NEW.data,'$.offer') BEGIN
 INSERT INTO quote_versions SELECT NEW.id,coalesce(max(version),0)+1,json_extract(NEW.data,'$.offer'),NEW.updated_at,NEW.actor FROM quote_versions WHERE request_id=NEW.id;
END;
CREATE TABLE bookings (id TEXT PRIMARY KEY, request_id TEXT NOT NULL UNIQUE REFERENCES requests(id), quote_version INTEGER NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL);
CREATE TABLE calendar_events (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul', resource TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, actor TEXT NOT NULL, CHECK(ends_at>starts_at));
CREATE INDEX calendar_range ON calendar_events(starts_at,ends_at,resource);
CREATE TRIGGER calendar_conflict_insert BEFORE INSERT ON calendar_events WHEN NEW.resource<>'' AND EXISTS(SELECT 1 FROM calendar_events WHERE resource=NEW.resource AND starts_at<NEW.ends_at AND ends_at>NEW.starts_at) BEGIN SELECT RAISE(ABORT,'resource-conflict'); END;
CREATE TRIGGER calendar_conflict_update BEFORE UPDATE ON calendar_events WHEN NEW.resource<>'' AND EXISTS(SELECT 1 FROM calendar_events WHERE id<>NEW.id AND resource=NEW.resource AND starts_at<NEW.ends_at AND ends_at>NEW.starts_at) BEGIN SELECT RAISE(ABORT,'resource-conflict'); END;
CREATE TABLE tasks (id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(id), title TEXT NOT NULL, due_at TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL, actor TEXT NOT NULL);
CREATE TRIGGER request_task AFTER INSERT ON requests BEGIN
 INSERT INTO tasks VALUES('review-'||NEW.id,NEW.id,'Anfrage prüfen',strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at/1000,'unixepoch','+1 day'),0,1,NEW.updated_at,NEW.actor);
END;
CREATE TRIGGER request_confirmed AFTER UPDATE ON requests WHEN json_extract(NEW.data,'$.status')='confirmed' AND json_extract(OLD.data,'$.status')<>'confirmed' BEGIN
 INSERT INTO bookings VALUES('booking-'||NEW.id,NEW.id,(SELECT max(version) FROM quote_versions WHERE request_id=NEW.id),NEW.updated_at,NEW.actor);
 INSERT INTO calendar_events VALUES('trip-'||NEW.id,NEW.id,coalesce(json_extract(NEW.data,'$.item.name'),json_extract(NEW.data,'$.hotelId'),'Reise'),json_extract(NEW.data,'$.from')||'T09:00:00.000Z',CASE WHEN json_extract(NEW.data,'$.to')>json_extract(NEW.data,'$.from') THEN json_extract(NEW.data,'$.to')||'T09:00:00.000Z' ELSE json_extract(NEW.data,'$.from')||'T10:00:00.000Z' END,'Europe/Istanbul','',1,NEW.updated_at,NEW.actor);
 INSERT INTO tasks VALUES('voucher-'||NEW.id,NEW.id,'Partnerbestätigung und Voucher prüfen',json_extract(NEW.data,'$.from')||'T06:00:00.000Z',0,1,NEW.updated_at,NEW.actor);
END;
CREATE TRIGGER quote_no_update BEFORE UPDATE ON quote_versions BEGIN SELECT RAISE(ABORT,'immutable-quote'); END;
CREATE TRIGGER quote_no_delete BEFORE DELETE ON quote_versions BEGIN SELECT RAISE(ABORT,'immutable-quote'); END;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'immutable-audit'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT,'immutable-audit'); END;
