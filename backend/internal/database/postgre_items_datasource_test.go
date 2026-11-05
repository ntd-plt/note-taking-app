package database_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"sort"
	"testing"
	"time"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newSchema connects to TEST_DATABASE_URL inside a fresh schema that is dropped when
// the test ends.
func newSchema(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping Postgres integration test")
	}
	ctx := context.Background()

	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatalf("connecting: %v", err)
	}
	buf := make([]byte, 6)
	_, _ = rand.Read(buf)
	schema := "t_" + hex.EncodeToString(buf)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("creating schema: %v", err)
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connecting to schema: %v", err)
	}
	t.Cleanup(func() {
		pool.Close()
		_, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE")
		admin.Close()
	})
	return pool
}

func migrationFiles(t *testing.T, pattern string) []string {
	t.Helper()
	files, err := filepath.Glob("../../migrations/" + pattern)
	if err != nil || len(files) == 0 {
		t.Fatalf("finding migrations %s: %v (%d files)", pattern, err, len(files))
	}
	sort.Strings(files)
	return files
}

func applyFiles(t *testing.T, pool *pgxpool.Pool, files ...string) {
	t.Helper()
	for _, file := range files {
		migration, err := os.ReadFile(file)
		if err != nil {
			t.Fatalf("reading migration: %v", err)
		}
		if _, err := pool.Exec(context.Background(), string(migration)); err != nil {
			t.Fatalf("applying %s: %v", file, err)
		}
	}
}

func newItemsDB(t *testing.T) (*database.PostgreItemsDataSource, *pgxpool.Pool) {
	t.Helper()
	pool := newSchema(t)
	applyFiles(t, pool, migrationFiles(t, "*.up.sql")...)
	return database.NewPostgreItemsDataSource(pool), pool
}

// newUser signs a user up, which also creates their workspace.
func newUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	u := model.New().WithEmail(uuid.NewString() + "@example.com").WithUsername("u").WithPasswordHash([]byte("h"))
	if err := database.NewPostgreUserDataSource(pool).AddUser(*u); err != nil {
		t.Fatalf("creating user: %v", err)
	}
	return u.ID
}

func isNotFound(err error) bool {
	var nf *pkg.NotFoundError
	return errors.As(err, &nf)
}

// builder collects items so a test can create a whole tree in one ApplyOps batch,
// each item appended to its parent.
type builder struct {
	items []model.Item
	index map[uuid.UUID]int
}

func newBuilder() *builder { return &builder{index: map[uuid.UUID]int{}} }

func (b *builder) add(parent uuid.UUID, typ model.ItemType, name string) uuid.UUID {
	props := model.Props{"name": name}
	if typ != model.ItemTypePage {
		props = model.Props{"content": []any{map[string]any{"type": "text", "text": name, "styles": map[string]any{}}}}
	}
	if typ == model.ItemTypeHeading {
		props["level"] = 2
	}
	props, err := model.CompleteProps(typ, props)
	if err != nil {
		panic(err)
	}
	it := model.Item{ID: uuid.New(), ParentID: &parent, Type: typ, ChildIDs: []uuid.UUID{}, Props: props}
	if i, ok := b.index[parent]; ok {
		b.items[i].ChildIDs = append(b.items[i].ChildIDs, it.ID)
	}
	b.index[it.ID] = len(b.items)
	b.items = append(b.items, it)
	return it.ID
}

func mustInsert(t *testing.T, db *database.PostgreItemsDataSource, userID uuid.UUID, b *builder) {
	t.Helper()
	ops := make([]model.Op, len(b.items))
	for i, it := range b.items {
		ops[i] = model.Op{Op: model.OpCreate, ID: it.ID, Type: ptr(it.Type), ParentID: it.ParentID, Props: it.Props}
	}
	if err := db.ApplyOps(userID, ops); err != nil {
		t.Fatalf("creating: %v", err)
	}
}

func workspaceOf(t *testing.T, db *database.PostgreItemsDataSource, userID uuid.UUID) model.Item {
	t.Helper()
	ws, err := db.GetWorkspace(userID)
	if err != nil {
		t.Fatalf("getting workspace: %v", err)
	}
	return ws
}

func TestPostgresSignupCreatesOneWorkspace(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)

	ws := workspaceOf(t, db, me)
	if ws.Type != model.ItemTypeWorkspace || ws.ParentID != nil || len(ws.ChildIDs) != 0 {
		t.Errorf("workspace = %+v", ws)
	}
	_, err := pool.Exec(context.Background(), "INSERT INTO items (id, user_id, type) VALUES ($1, $2, 'workspace')", uuid.New(), me)
	if err == nil {
		t.Error("a second workspace for the same user was accepted")
	}
}

func TestPostgresSchemaChecks(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)
	ws := workspaceOf(t, db, me).ID
	theirs := workspaceOf(t, db, other).ID

	cases := map[string]string{
		"page without a name":  `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', '{"icon": "x"}')`,
		"page without an icon": `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', '{"name": "x"}')`,
		"blank page name":      `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', '{"name": "  ", "icon": "x"}')`,
		"name not a string":    `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', '{"name": 1, "icon": "x"}')`,
		"props not an object":  `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'quote', '[]')`,
		"trashed block":        "INSERT INTO items (id, user_id, parent_id, type, trashed_at) VALUES ($1, $2, $3, 'quote', NOW())",
		"unknown type":         "INSERT INTO items (id, user_id, parent_id, type) VALUES ($1, $2, $3, 'codeBlock')",
		"block without parent": "INSERT INTO items (id, user_id, type) SELECT $1, $2, 'paragraph' WHERE $3::uuid IS NOT NULL",
		"page name too long":   `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', jsonb_build_object('name', repeat('a', 256), 'icon', 'x'))`,
		"page icon too long":   `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', jsonb_build_object('name', 'x', 'icon', repeat('a', 33)))`,
		"props too large":      `INSERT INTO items (id, user_id, parent_id, type, props) VALUES ($1, $2, $3, 'page', jsonb_build_object('name', 'x', 'icon', 'x', 'big', repeat('a', 140000)))`,
	}
	for name, query := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := pool.Exec(context.Background(), query, uuid.New(), me, ws); err == nil {
				t.Error("accepted")
			}
		})
	}
	t.Run("parent owned by another user", func(t *testing.T) {
		_, err := pool.Exec(context.Background(),
			"INSERT INTO items (id, user_id, parent_id, type) VALUES ($1, $2, $3, 'paragraph')", uuid.New(), me, theirs)
		if err == nil {
			t.Error("accepted")
		}
	})
}

func TestPostgresPageTreeFollowsChildIDsAndStopsAtChildPages(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID

	b := newBuilder()
	page := b.add(ws, model.ItemTypePage, "Page")
	first := b.add(page, model.ItemTypeParagraph, "first")
	bullet := b.add(page, model.ItemTypeBulletListItem, "bullet")
	nested := b.add(bullet, model.ItemTypeBulletListItem, "nested")
	child := b.add(bullet, model.ItemTypePage, "Child")
	b.add(child, model.ItemTypeParagraph, "inside child")
	last := b.add(page, model.ItemTypeHeading, "last")
	b.items[b.index[last]].Props["level"] = 3
	mustInsert(t, db, me, b)
	// Put the heading first: order must come from child_ids, not creation order.
	if _, err := pool.Exec(context.Background(), "UPDATE items SET child_ids = $2 WHERE id = $1",
		page, []uuid.UUID{last, first, bullet}); err != nil {
		t.Fatal(err)
	}

	items, err := db.GetPageTree(me, page)
	if err != nil {
		t.Fatal(err)
	}
	var ids []uuid.UUID
	for _, it := range items {
		ids = append(ids, it.ID)
	}
	if want := []uuid.UUID{page, last, first, bullet, nested, child}; !slices.Equal(ids, want) {
		t.Fatalf("items = %v, want %v", ids, want)
	}
	if items[1].Props["level"] != float64(3) || items[2].Props["content"] == nil {
		t.Errorf("props = %v, %v", items[1].Props, items[2].Props)
	}
	if c := items[5]; c.Name() != "Child" || c.Props["icon"] != model.DefaultPageIcon || c.Props["is_favorite"] != false {
		t.Errorf("child page = %+v", c)
	}
	if !slices.Equal(items[3].ChildIDs, []uuid.UUID{nested, child}) {
		t.Errorf("bullet child_ids = %v", items[3].ChildIDs)
	}
	if got := workspaceOf(t, db, me).ChildIDs; !slices.Equal(got, []uuid.UUID{page}) {
		t.Errorf("workspace child_ids = %v, want the new page appended", got)
	}

	if _, err := db.GetPageTree(me, bullet); !isNotFound(err) {
		t.Errorf("page tree of a block: err = %v, want not found", err)
	}
	if _, err := db.GetPageTree(newUser(t, pool), page); !isNotFound(err) {
		t.Errorf("page tree of another user's page: err = %v, want not found", err)
	}
}

func TestPostgresResolveItemAndAncestors(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID

	b := newBuilder()
	top := b.add(ws, model.ItemTypePage, "Top")
	toggle := b.add(top, model.ItemTypeToggleListItem, "toggle")
	mid := b.add(toggle, model.ItemTypePage, "Mid")
	leaf := b.add(mid, model.ItemTypePage, "Leaf")
	quote := b.add(leaf, model.ItemTypeQuote, "quote")
	deep := b.add(quote, model.ItemTypeParagraph, "deep")
	mustInsert(t, db, me, b)

	loc, err := db.ResolveItem(me, deep)
	if err != nil {
		t.Fatal(err)
	}
	if loc.PageID != leaf || loc.Type != model.ItemTypeParagraph || loc.InTrash {
		t.Errorf("resolve block = %+v", loc)
	}
	if loc, err := db.ResolveItem(me, mid); err != nil || loc.PageID != mid {
		t.Errorf("resolve page = %+v, %v", loc, err)
	}
	if _, err := db.ResolveItem(me, ws); !isNotFound(err) {
		t.Errorf("resolve workspace: err = %v, want not found", err)
	}
	if _, err := db.ResolveItem(newUser(t, pool), deep); !isNotFound(err) {
		t.Errorf("resolve another user's block: err = %v, want not found", err)
	}

	crumbs, err := db.Ancestors(me, leaf)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, c := range crumbs {
		names = append(names, c.Name())
	}
	if !slices.Equal(names, []string{"Top", "Mid"}) {
		t.Errorf("ancestors = %v", names)
	}
	if crumbs, err := db.Ancestors(me, top); err != nil || len(crumbs) != 0 {
		t.Errorf("ancestors of a top-level page = %v, %v", crumbs, err)
	}

	// Trash the top page the way the trash will: leave it under the workspace,
	// stamped, and out of the workspace's child_ids.
	if _, err := pool.Exec(context.Background(), "UPDATE items SET trashed_at = NOW() WHERE id = $1", top); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(context.Background(), "UPDATE items SET child_ids = '{}' WHERE id = $1", ws); err != nil {
		t.Fatal(err)
	}
	if loc, err := db.ResolveItem(me, deep); err != nil || !loc.InTrash {
		t.Errorf("resolve inside a trashed page = %+v, %v; want in_trash", loc, err)
	}
}

func TestPostgresListPagesInDocumentOrder(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID

	b := newBuilder()
	a := b.add(ws, model.ItemTypePage, "A")
	bullet := b.add(a, model.ItemTypeBulletListItem, "bullet")
	a1 := b.add(bullet, model.ItemTypePage, "A1")
	a2 := b.add(a, model.ItemTypePage, "A2")
	gone := b.add(ws, model.ItemTypePage, "Gone")
	b.add(gone, model.ItemTypePage, "Inside gone")
	z := b.add(ws, model.ItemTypePage, "Z")
	mustInsert(t, db, me, b)

	other := newUser(t, pool)
	ob := newBuilder()
	ob.add(workspaceOf(t, db, other).ID, model.ItemTypePage, "Theirs")
	mustInsert(t, db, other, ob)

	ctx := context.Background()
	if _, err := pool.Exec(ctx, "UPDATE items SET trashed_at = NOW() WHERE id = $1", gone); err != nil {
		t.Fatal(err)
	}
	// Reverse the top level: Z before A.
	if _, err := pool.Exec(ctx, "UPDATE items SET child_ids = $2 WHERE id = $1", ws, []uuid.UUID{z, a}); err != nil {
		t.Fatal(err)
	}

	pages, err := db.ListPages(me)
	if err != nil {
		t.Fatal(err)
	}
	var ids []uuid.UUID
	for _, p := range pages {
		ids = append(ids, p.ID)
	}
	if !slices.Equal(ids, []uuid.UUID{z, a, a1, a2}) {
		t.Fatalf("pages = %+v", pages)
	}
	if *pages[0].ParentID != ws || pages[0].ParentPageID != nil || pages[0].Name() != "Z" {
		t.Errorf("Z = %+v", pages[0])
	}
	if *pages[2].ParentID != bullet || pages[2].ParentPageID == nil || *pages[2].ParentPageID != a {
		t.Errorf("A1 = %+v, want parent the bullet and parent page A", pages[2])
	}
	if *pages[3].ParentID != a || *pages[3].ParentPageID != a {
		t.Errorf("A2 = %+v", pages[3])
	}
}

// ListPages and GetPageTree hide a trashed page wherever it sits, not only directly
// under the workspace where the trash puts it.
func TestPostgresTrashedPageHiddenAtAnyDepth(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID

	b := newBuilder()
	a := b.add(ws, model.ItemTypePage, "A")
	bullet := b.add(a, model.ItemTypeBulletListItem, "bullet")
	gone := b.add(bullet, model.ItemTypePage, "Gone")
	b.add(gone, model.ItemTypePage, "Inside gone")
	kept := b.add(a, model.ItemTypePage, "Kept")
	mustInsert(t, db, me, b)
	if _, err := pool.Exec(context.Background(), "UPDATE items SET trashed_at = NOW() WHERE id = $1", gone); err != nil {
		t.Fatal(err)
	}

	pages, err := db.ListPages(me)
	if err != nil {
		t.Fatal(err)
	}
	var ids []uuid.UUID
	for _, p := range pages {
		ids = append(ids, p.ID)
	}
	if !slices.Equal(ids, []uuid.UUID{a, kept}) {
		t.Errorf("pages = %v, want A and Kept", ids)
	}
	items, err := db.GetPageTree(me, a)
	if err != nil {
		t.Fatal(err)
	}
	for _, it := range items {
		if it.ID == gone {
			t.Error("page tree includes the trashed page")
		}
	}
}

func TestPostgresTrashRestoreAndDelete(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	other := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID

	b := newBuilder()
	a := b.add(ws, model.ItemTypePage, "A")
	bullet := b.add(a, model.ItemTypeBulletListItem, "bullet")
	child := b.add(bullet, model.ItemTypePage, "Child")
	inChild := b.add(child, model.ItemTypeParagraph, "inside")
	deep := b.add(inChild, model.ItemTypePage, "Deep")
	old := b.add(ws, model.ItemTypePage, "Old")
	mustInsert(t, db, me, b)
	ob := newBuilder()
	theirs := ob.add(workspaceOf(t, db, other).ID, model.ItemTypePage, "Theirs")
	mustInsert(t, db, other, ob)

	trash := func(user uuid.UUID, id uuid.UUID) {
		t.Helper()
		if err := db.ApplyOps(user, []model.Op{{Op: model.OpTrash, ID: id}}); err != nil {
			t.Fatal(err)
		}
	}
	trash(me, child)
	trash(me, old)
	trash(other, theirs)
	if _, err := pool.Exec(context.Background(), "UPDATE items SET trashed_at = NOW() - interval '40 days' WHERE id = $1", old); err != nil {
		t.Fatal(err)
	}

	pages, err := db.ListTrash(me)
	if err != nil || len(pages) != 2 || pages[0].ID != child || pages[1].ID != old {
		t.Fatalf("trash = %+v (%v), want Child then Old, and not Deep or another user's page", pages, err)
	}

	// Back to its old place, then into the trash again.
	pos := 0
	if err := db.ApplyOps(me, []model.Op{{Op: model.OpRestore, ID: child, ParentID: &bullet, Position: &pos}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := db.GetItem(me, bullet); !slices.Equal(got.ChildIDs, []uuid.UUID{child}) {
		t.Errorf("bullet children = %v, want Child back", got.ChildIDs)
	}
	trash(me, child)

	before := time.Now().Add(-30 * 24 * time.Hour)
	if n, err := db.EmptyTrash(me, &before); err != nil || n != 1 {
		t.Fatalf("purge removed %d (%v), want only Old", n, err)
	}
	if err := db.DeleteFromTrash(me, deep); !isNotFound(err) {
		t.Errorf("deleting a page inside a trashed page: %v, want not found", err)
	}
	if err := db.DeleteFromTrash(me, theirs); !isNotFound(err) {
		t.Errorf("deleting another user's page: %v, want not found", err)
	}
	if err := db.DeleteFromTrash(me, child); err != nil {
		t.Fatal(err)
	}
	var left int
	if err := pool.QueryRow(context.Background(), "SELECT count(*) FROM items WHERE id = ANY($1)",
		[]uuid.UUID{child, inChild, deep, old}).Scan(&left); err != nil || left != 0 {
		t.Errorf("%d rows left (%v), want the trashed pages and all inside them gone", left, err)
	}
	if n, err := db.EmptyTrash(other, nil); err != nil || n != 1 {
		t.Errorf("other user's empty removed %d (%v), want 1", n, err)
	}
}

func TestPostgresOpenItem(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID

	b := newBuilder()
	top := b.add(ws, model.ItemTypePage, "Top")
	page := b.add(top, model.ItemTypePage, "Page")
	quote := b.add(page, model.ItemTypeQuote, "quote")
	mustInsert(t, db, me, b)

	opened, err := db.OpenItem(me, quote)
	if err != nil {
		t.Fatal(err)
	}
	if opened.Location.PageID != page || opened.Location.Type != model.ItemTypeQuote || opened.Location.InTrash {
		t.Errorf("location = %+v", opened.Location)
	}
	if len(opened.Items) != 2 || opened.Items[0].ID != page || opened.Items[1].ID != quote {
		t.Errorf("items = %+v", opened.Items)
	}
	if len(opened.Ancestors) != 1 || opened.Ancestors[0].ID != top {
		t.Errorf("ancestors = %+v", opened.Ancestors)
	}
	if _, err := db.OpenItem(me, ws); !isNotFound(err) {
		t.Errorf("opening the workspace: err = %v, want not found", err)
	}
}

// Every block type the model knows must be one the schema accepts.
func TestPostgresSchemaAcceptsEveryBlockType(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	b := newBuilder()
	page := b.add(workspaceOf(t, db, me).ID, model.ItemTypePage, "Page")
	mustInsert(t, db, me, b)
	for _, typ := range model.BlockTypes {
		if _, err := pool.Exec(context.Background(),
			"INSERT INTO items (id, user_id, parent_id, type) VALUES ($1, $2, $3, $4)", uuid.New(), me, page, typ); err != nil {
			t.Errorf("%s: %v", typ, err)
		}
	}
}

func TestPostgresMigrationGivesExistingUsersAWorkspace(t *testing.T) {
	pool := newSchema(t)
	applyFiles(t, pool, migrationFiles(t, "00[12]_*.up.sql")...)
	ctx := context.Background()
	me := uuid.New()
	if _, err := pool.Exec(ctx, "INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'u', 'old@example.com', 'h')", me); err != nil {
		t.Fatal(err)
	}
	applyFiles(t, pool, migrationFiles(t, "003_*.up.sql")...)

	if _, err := database.NewPostgreItemsDataSource(pool).GetWorkspace(me); err != nil {
		t.Errorf("existing user has no workspace: %v", err)
	}

	applyFiles(t, pool, migrationFiles(t, "003_*.down.sql")...)
	var tables int
	if err := pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM information_schema.tables
		WHERE table_schema = current_schema() AND table_name IN ('items', 'note_contents', 'trash_items')`).Scan(&tables); err != nil {
		t.Fatal(err)
	}
	if tables != 3 {
		t.Errorf("after the down migration found %d of the old tables, want 3", tables)
	}
}
