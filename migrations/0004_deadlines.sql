CREATE TRIGGER payment_deadline AFTER UPDATE ON requests BEGIN
 INSERT OR IGNORE INTO tasks(id,request_id,title,due_at,done,version,updated_at,actor)
 SELECT 'payment-'||NEW.id||'-'||json_extract(value,'$.id'),NEW.id,'Zahlungseingang prüfen',
 CASE WHEN length(json_extract(value,'$.due'))=10 THEN json_extract(value,'$.due')||'T09:00:00.000Z' ELSE strftime('%Y-%m-%dT%H:%M:%fZ',NEW.updated_at/1000,'unixepoch','+7 days') END,0,1,NEW.updated_at,NEW.actor
 FROM json_each(NEW.data,'$.folio.payments') WHERE json_extract(value,'$.status')='pending';
 UPDATE tasks SET done=1,version=version+1,updated_at=NEW.updated_at,actor=NEW.actor WHERE request_id=NEW.id AND done=0 AND id IN (SELECT 'payment-'||NEW.id||'-'||json_extract(value,'$.id') FROM json_each(NEW.data,'$.folio.payments') WHERE json_extract(value,'$.status')='paid');
 UPDATE tasks SET done=1,version=version+1,updated_at=NEW.updated_at,actor=NEW.actor WHERE id='review-'||NEW.id AND done=0 AND json_extract(NEW.data,'$.assignedTo') IS NOT NULL;
END;
CREATE TABLE calendar_history (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL REFERENCES calendar_events(id), old_start TEXT NOT NULL, old_end TEXT NOT NULL, old_resource TEXT NOT NULL, new_start TEXT NOT NULL, new_end TEXT NOT NULL, new_resource TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TRIGGER calendar_history_update AFTER UPDATE ON calendar_events BEGIN
 INSERT INTO calendar_history(event_id,old_start,old_end,old_resource,new_start,new_end,new_resource,actor,at) VALUES(NEW.id,OLD.starts_at,OLD.ends_at,OLD.resource,NEW.starts_at,NEW.ends_at,NEW.resource,NEW.actor,NEW.updated_at);
END;
CREATE TRIGGER calendar_history_immutable BEFORE UPDATE ON calendar_history BEGIN SELECT RAISE(ABORT,'immutable-history'); END;
CREATE TRIGGER calendar_history_no_delete BEFORE DELETE ON calendar_history BEGIN SELECT RAISE(ABORT,'immutable-history'); END;
-- Additive backfill for installations that tested the earlier shared backend.
-- Historical confirmed flags are deliberately not converted into verified bookings.
INSERT OR IGNORE INTO quote_versions SELECT id,1,json_extract(data,'$.offer'),updated_at,actor FROM requests WHERE json_type(data,'$.offer')='object';
INSERT OR IGNORE INTO tasks SELECT 'review-'||id,id,'Importierte Reise prüfen',strftime('%Y-%m-%dT%H:%M:%fZ',updated_at/1000,'unixepoch','+1 day'),0,1,updated_at,actor FROM requests;
