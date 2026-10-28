-- Back to the folder/note schema of migrations 001 and 002. Item data is lost.
DROP TABLE IF EXISTS items;

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

CREATE INDEX IF NOT EXISTS idx_items_user_parent ON items(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);

CREATE TABLE IF NOT EXISTS trash_items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID,
    type VARCHAR(16) NOT NULL CHECK (type IN ('note', 'folder')),
    name VARCHAR(255) NOT NULL CHECK (char_length(btrim(name)) > 0),
    icon TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    batch_id UUID NOT NULL,
    content TEXT CHECK (octet_length(content) <= 1048576),
    CONSTRAINT trash_items_content_for_notes CHECK ((type = 'note') = (content IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_trash_items_user_deleted ON trash_items(user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_trash_items_deleted ON trash_items(deleted_at);
CREATE INDEX IF NOT EXISTS idx_trash_items_parent ON trash_items(parent_id);
