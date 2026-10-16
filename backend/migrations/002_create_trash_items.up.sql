-- Trashed items live here instead of in items, so every existing items query only
-- ever sees live rows. parent_id is deliberately not a foreign key: the original
-- parent may be live, trashed, or gone by the time the item is restored.
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
