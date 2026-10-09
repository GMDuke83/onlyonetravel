-- Add credentials without rewriting existing users, sessions or travel data.
CREATE TABLE IF NOT EXISTS staff_credentials (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
