-- Notes become one tree of items per user: a hidden workspace root, pages, and the
-- BlockNote blocks inside them. There is no deployed data, so the folder/note tables
-- are dropped rather than converted.
DROP TABLE IF EXISTS note_contents;
DROP TABLE IF EXISTS trash_items;
DROP TABLE IF EXISTS items;

-- child_rank is where id sits in a parent's child_ids, for ordering children. A
-- child the list does not mention sorts after the listed ones.
CREATE OR REPLACE FUNCTION child_rank(child_ids UUID[], id UUID) RETURNS INTEGER
    LANGUAGE SQL IMMUTABLE AS 'SELECT COALESCE(array_position(child_ids, id), 2147483647)';

CREATE TABLE items (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID,
    type VARCHAR(32) NOT NULL CHECK (type IN (
        'workspace', 'page', 'paragraph', 'heading', 'bulletListItem',
        'numberedListItem', 'checkListItem', 'toggleListItem', 'quote')),
    -- Ordered ids of the children that are not in the trash.
    child_ids UUID[] NOT NULL DEFAULT '{}',
    -- Key-value properties defined by the type: a page's name, icon and
    -- is_favorite, a block's BlockNote inline content, a heading's level, ...
    -- The server caps props at 64 KB of JSON; the text form Postgres measures here
    -- adds spaces, so this backstop is looser.
    props JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(props) = 'object')
        CHECK (octet_length(props::text) <= 131072),
    trashed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT items_id_user_key UNIQUE (id, user_id),
    CONSTRAINT items_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT items_parent_fkey FOREIGN KEY (parent_id, user_id)
        REFERENCES items (id, user_id) ON DELETE CASCADE,
    CONSTRAINT items_root_is_workspace CHECK ((parent_id IS NULL) = (type = 'workspace')),
    -- COALESCE: a missing key makes the test NULL, which a CHECK would let through.
    CONSTRAINT items_page_props CHECK (type <> 'page' OR COALESCE(
        jsonb_typeof(props->'name') = 'string' AND char_length(btrim(props->>'name')) BETWEEN 1 AND 255
        AND jsonb_typeof(props->'icon') = 'string' AND char_length(props->>'icon') BETWEEN 1 AND 32, FALSE)),
    CONSTRAINT items_page_trash CHECK (type = 'page' OR trashed_at IS NULL)
);

CREATE UNIQUE INDEX idx_items_one_workspace ON items(user_id) WHERE type = 'workspace';
CREATE INDEX idx_items_parent ON items(parent_id);
CREATE INDEX idx_items_user_pages ON items(user_id) WHERE type = 'page';
CREATE INDEX idx_items_favorites ON items(user_id) WHERE type = 'page' AND props->'is_favorite' = 'true';
CREATE INDEX idx_items_trashed ON items(user_id, trashed_at) WHERE trashed_at IS NOT NULL;

-- Users that already exist get their workspace here; new ones get it at signup.
INSERT INTO items (id, user_id, type)
SELECT gen_random_uuid(), id, 'workspace' FROM users;
