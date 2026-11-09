-- Login sessions. The session cookie holds a random id; only its SHA-256 hash is
-- stored, so a leaked table hands out no working sessions. A session ends at
-- idle_expires_at (pushed forward while it is used) or absolute_expires_at (fixed at
-- login), whichever comes first.
CREATE TABLE sessions (
    id_hash BYTEA PRIMARY KEY CHECK (octet_length(id_hash) = 32),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL,
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT NOT NULL DEFAULT '' CHECK (char_length(user_agent) <= 512)
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
