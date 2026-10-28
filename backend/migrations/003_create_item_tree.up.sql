-- Notes become one tree of items per user: a hidden workspace root, pages, and the
-- BlockNote blocks inside them. There is no deployed data, so the folder/note tables
-- are dropped rather than converted.
DROP TABLE IF EXISTS note_contents;
DROP TABLE IF EXISTS trash_items;
DROP TABLE IF EXISTS items;

CREATE TABLE items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID,
    type VARCHAR(32) NOT NULL CHECK (type IN (
        'workspace', 'page', 'paragraph', 'heading', 'bulletListItem',
        'numberedListItem', 'checkListItem', 'toggleListItem', 'quote')),
    -- Ordered ids of the children that are not in the trash.
    child_ids UUID[] NOT NULL DEFAULT '{}',
    props JSONB NOT NULL DEFAULT '{}',
    -- BlockNote inline content.
    content JSONB NOT NULL DEFAULT '[]',
    name VARCHAR(255) CHECK (name IS NULL OR char_length(btrim(name)) > 0),
    icon TEXT,
    is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
    trashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_id_user_key UNIQUE (id, user_id),
    CONSTRAINT items_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT items_parent_fkey FOREIGN KEY (parent_id, user_id)
        REFERENCES items (id, user_id) ON DELETE CASCADE,
    CONSTRAINT items_root_is_workspace CHECK ((parent_id IS NULL) = (type = 'workspace')),
    CONSTRAINT items_page_name CHECK ((name IS NOT NULL) = (type = 'page')),
    CONSTRAINT items_page_icon CHECK ((icon IS NOT NULL) = (type = 'page')),
    CONSTRAINT items_page_favorite CHECK (type = 'page' OR NOT is_favorite),
    CONSTRAINT items_page_trash CHECK (type = 'page' OR trashed_at IS NULL)
);

CREATE UNIQUE INDEX idx_items_one_workspace ON items(user_id) WHERE type = 'workspace';
CREATE INDEX idx_items_parent ON items(parent_id);
CREATE INDEX idx_items_user_pages ON items(user_id) WHERE type = 'page';
CREATE INDEX idx_items_trashed ON items(user_id, trashed_at) WHERE trashed_at IS NOT NULL;

-- Users that already exist get their workspace here; new ones get it at signup.
INSERT INTO items (id, user_id, type)
SELECT gen_random_uuid(), id, 'workspace' FROM users;
