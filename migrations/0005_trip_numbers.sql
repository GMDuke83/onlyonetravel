-- Reservations may have gaps after failed requests; numbers are never reused.
CREATE TABLE trip_numbers (seq INTEGER PRIMARY KEY AUTOINCREMENT, request_id TEXT NOT NULL UNIQUE);
