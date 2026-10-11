CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID,
    parent_type VARCHAR(16) GENERATED ALWAYS AS ('folder') STORED,
    type VARCHAR(16) NOT NULL CHECK (type IN ('note', 'folder')),
    name VARCHAR(255) NOT NULL CHECK (char_length(btrim(name)) > 0),
    icon TEXT NOT NULL,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_id_type_key UNIQUE (id, type),
    CONSTRAINT items_id_user_type_key UNIQUE (id, user_id, type),
    CONSTRAINT items_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT items_parent_fkey FOREIGN KEY (parent_id, user_id, parent_type)
        REFERENCES items (id, user_id, type) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS note_contents (
    item_id UUID PRIMARY KEY,
    item_type VARCHAR(16) GENERATED ALWAYS AS ('note') STORED,
    content TEXT NOT NULL DEFAULT '' CHECK (octet_length(content) <= 1048576),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT note_contents_item_fkey FOREIGN KEY (item_id, item_type)
        REFERENCES items (id, type) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_items_user_parent ON items(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);
