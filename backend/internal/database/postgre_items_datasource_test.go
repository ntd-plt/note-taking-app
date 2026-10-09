package database_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"strings"
	"testing"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/services"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func newItemsDB(t *testing.T) (*database.PostgreItemsDataSource, *pgxpool.Pool) {
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

	migration, err := os.ReadFile("../../migrations/001_create_users.up.sql")
	if err != nil {
		t.Fatalf("reading migration: %v", err)
	}
	if _, err := pool.Exec(ctx, string(migration)); err != nil {
		t.Fatalf("applying migration: %v", err)
	}
	return database.NewPostgreItemsDataSource(pool), pool
}

func newUser(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	id := uuid.New()
	_, err := pool.Exec(context.Background(),
		"INSERT INTO users (id, name, email, password_hash) VALUES ($1, 'u', $2, 'h')", id, id.String()+"@example.com")
	if err != nil {
		t.Fatalf("creating user: %v", err)
	}
	return id
}

func mustCreate(t *testing.T, db *database.PostgreItemsDataSource, userID uuid.UUID, typ model.ItemType, name string, parent *uuid.UUID) model.Item {
	t.Helper()
	it, err := db.CreateItem(model.Item{UserID: userID, ParentID: parent, Type: typ, Name: name, Icon: "x"}, "content of "+name)
	if err != nil {
		t.Fatalf("creating %s %q: %v", typ, name, err)
	}
	return it
}

func isNotFound(err error) bool {
	var nf *pkg.NotFoundError
	return errors.As(err, &nf)
}

func parentOf(t *testing.T, db *database.PostgreItemsDataSource, userID, id uuid.UUID) *uuid.UUID {
	t.Helper()
	it, err := db.GetItem(userID, id)
	if err != nil {
		t.Fatal(err)
	}
	return it.ParentID
}

func TestItemsCreateGetAndOwnership(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)

	folder := mustCreate(t, db, me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, db, me, model.ItemTypeNote, "Note", &folder.ID)
	if note.CreatedAt.IsZero() {
		t.Error("created_at was not filled in")
	}

	if got, err := db.GetItem(me, note.ID); err != nil || got.ID != note.ID {
		t.Fatalf("GetItem = %+v, %v", got, err)
	}
	if _, err := db.GetItem(other, note.ID); !isNotFound(err) {
		t.Errorf("another user's GetItem err = %v, want not found", err)
	}
	if _, err := db.UpdateItem(other, note.ID, model.ItemPatch{Name: ptr("x")}); !isNotFound(err) {
		t.Errorf("another user's UpdateItem err = %v, want not found", err)
	}
	if err := db.DeleteItem(other, note.ID); !isNotFound(err) {
		t.Errorf("another user's DeleteItem err = %v, want not found", err)
	}
	if _, err := db.GetNoteContent(other, note.ID); !isNotFound(err) {
		t.Errorf("another user's GetNoteContent err = %v, want not found", err)
	}
	if _, err := db.GetItem(me, note.ID); err != nil {
		t.Errorf("the note disappeared after another user's attempts: %v", err)
	}
}

func TestItemsCreateParentRules(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)
	note := mustCreate(t, db, me, model.ItemTypeNote, "Note", nil)
	theirs := mustCreate(t, db, other, model.ItemTypeFolder, "Theirs", nil)

	for name, parent := range map[string]uuid.UUID{
		"a note":                note.ID,
		"another user's folder": theirs.ID,
		"a missing item":        uuid.New(),
	} {
		_, err := db.CreateItem(model.Item{UserID: me, ParentID: &parent, Type: model.ItemTypeNote, Name: "X", Icon: "x"}, "")
		if !errors.Is(err, database.ErrInvalidParent) {
			t.Errorf("parent is %s: err = %v, want ErrInvalidParent", name, err)
		}
	}

	id := uuid.New()
	if _, err := db.CreateItem(model.Item{ID: id, UserID: me, Type: model.ItemTypeNote, Name: "A", Icon: "x"}, ""); err != nil {
		t.Fatal(err)
	}
	_, err := db.CreateItem(model.Item{ID: id, UserID: me, Type: model.ItemTypeNote, Name: "B", Icon: "x"}, "")
	var exists *pkg.AlreadyExistsError
	if !errors.As(err, &exists) {
		t.Errorf("duplicate id err = %v, want AlreadyExistsError", err)
	}

	var count int
	_ = pool.QueryRow(context.Background(), "SELECT count(*) FROM items").Scan(&count)
	if count != 3 {
		t.Errorf("%d items stored, want 3: failed creates must leave nothing behind", count)
	}
}

func TestItemsCreateTooDeep(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)

	var parent *uuid.UUID
	for i := 0; i < database.MaxTreeDepth; i++ {
		f := mustCreate(t, db, me, model.ItemTypeFolder, "level", parent)
		parent = &f.ID
	}
	_, err := db.CreateItem(model.Item{UserID: me, ParentID: parent, Type: model.ItemTypeNote, Name: "deep", Icon: "x"}, "")
	if !errors.Is(err, database.ErrTooDeep) {
		t.Errorf("err = %v, want ErrTooDeep", err)
	}
	var count int
	_ = pool.QueryRow(context.Background(), "SELECT count(*) FROM items").Scan(&count)
	if count != database.MaxTreeDepth {
		t.Errorf("%d items stored, want %d: the rejected note must not remain", count, database.MaxTreeDepth)
	}
}

func TestItemsListOrderAndFilters(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)
	mustCreate(t, db, me, model.ItemTypeNote, "b note", nil)
	zeta := mustCreate(t, db, me, model.ItemTypeFolder, "Zeta", nil)
	mustCreate(t, db, me, model.ItemTypeNote, "A note", nil)
	mustCreate(t, db, me, model.ItemTypeFolder, "alpha", nil)
	mustCreate(t, db, me, model.ItemTypeNote, "inside", &zeta.ID)
	mustCreate(t, db, other, model.ItemTypeNote, "not mine", nil)

	all, err := db.ListItems(me, model.ItemFilter{})
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, it := range all {
		names = append(names, it.Name)
	}
	if got, want := strings.Join(names, ","), "alpha,Zeta,A note,b note,inside"; got != want {
		t.Errorf("order = %s, want %s (folders first, then by name ignoring case)", got, want)
	}

	root, _ := db.ListItems(me, model.ItemFilter{ParentSet: true})
	if len(root) != 4 {
		t.Errorf("top level has %d items, want 4", len(root))
	}
	children, _ := db.ListItems(me, model.ItemFilter{ParentSet: true, ParentID: &zeta.ID})
	if len(children) != 1 || children[0].Name != "inside" {
		t.Errorf("children = %+v, want [inside]", children)
	}
	empty, _ := db.ListItems(newUser(t, pool), model.ItemFilter{})
	if empty == nil || len(empty) != 0 {
		t.Errorf("an empty listing = %#v, want an empty non-nil slice", empty)
	}
}

func TestItemsUpdateIsPartial(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	note := mustCreate(t, db, me, model.ItemTypeNote, "Old", nil)

	got, err := db.UpdateItem(me, note.ID, model.ItemPatch{IsFavorite: ptr(true)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "Old" || got.Icon != "x" || !got.IsFavorite {
		t.Errorf("got %+v, want only is_favorite changed", got)
	}
	got, err = db.UpdateItem(me, note.ID, model.ItemPatch{Name: ptr("New"), IsFavorite: ptr(false)})
	if err != nil {
		t.Fatal(err)
	}
	if got.Name != "New" || got.IsFavorite {
		t.Errorf("got %+v, want name New and favorite cleared", got)
	}
	if !got.UpdatedAt.After(note.UpdatedAt) {
		t.Error("updated_at did not move forward")
	}
}

func TestItemsMove(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)
	top := mustCreate(t, db, me, model.ItemTypeFolder, "Top", nil)
	sub := mustCreate(t, db, me, model.ItemTypeFolder, "Sub", &top.ID)
	leaf := mustCreate(t, db, me, model.ItemTypeFolder, "Leaf", &sub.ID)
	note := mustCreate(t, db, me, model.ItemTypeNote, "Note", nil)
	dest := mustCreate(t, db, me, model.ItemTypeFolder, "Dest", nil)
	theirs := mustCreate(t, db, other, model.ItemTypeNote, "Theirs", nil)

	t.Run("moves a folder with its subtree", func(t *testing.T) {
		moved, err := db.MoveItems(me, []model.ItemMove{{ID: top.ID, ParentID: &dest.ID}, {ID: note.ID, ParentID: &dest.ID}})
		if err != nil || len(moved) != 2 {
			t.Fatalf("MoveItems = %v, %v", moved, err)
		}
		if p := parentOf(t, db, me, leaf.ID); p == nil || *p != sub.ID {
			t.Errorf("the subtree was re-parented to %v", p)
		}
		if p := parentOf(t, db, me, top.ID); p == nil || *p != dest.ID {
			t.Errorf("top parent = %v, want %v", p, dest.ID)
		}
	})

	t.Run("to the top level", func(t *testing.T) {
		if _, err := db.MoveItems(me, []model.ItemMove{{ID: note.ID}}); err != nil {
			t.Fatal(err)
		}
		if p := parentOf(t, db, me, note.ID); p != nil {
			t.Errorf("parent = %v, want nil", p)
		}
	})

	t.Run("rejects a cycle and changes nothing", func(t *testing.T) {
		_, err := db.MoveItems(me, []model.ItemMove{{ID: note.ID, ParentID: &sub.ID}, {ID: top.ID, ParentID: &leaf.ID}})
		if !errors.Is(err, database.ErrMoveConflict) {
			t.Errorf("err = %v, want ErrMoveConflict", err)
		}
		if p := parentOf(t, db, me, note.ID); p != nil {
			t.Errorf("the valid half of a failed move was applied: parent = %v", p)
		}
		if p := parentOf(t, db, me, top.ID); p == nil || *p != dest.ID {
			t.Errorf("top parent = %v, want it unchanged (%v)", p, dest.ID)
		}
	})

	t.Run("rejects a folder moved into itself", func(t *testing.T) {
		_, err := db.MoveItems(me, []model.ItemMove{{ID: dest.ID, ParentID: &dest.ID}})
		if err == nil {
			t.Error("moving a folder into itself must fail")
		}
	})

	t.Run("rejects a note as destination", func(t *testing.T) {
		_, err := db.MoveItems(me, []model.ItemMove{{ID: top.ID, ParentID: &note.ID}})
		if !errors.Is(err, database.ErrInvalidParent) {
			t.Errorf("err = %v, want ErrInvalidParent", err)
		}
	})

	t.Run("rejects another user's item or destination", func(t *testing.T) {
		if _, err := db.MoveItems(me, []model.ItemMove{{ID: theirs.ID, ParentID: &dest.ID}}); !errors.Is(err, database.ErrMoveConflict) {
			t.Errorf("moving their item: err = %v, want ErrMoveConflict", err)
		}
		if _, err := db.MoveItems(other, []model.ItemMove{{ID: theirs.ID, ParentID: &dest.ID}}); !errors.Is(err, database.ErrInvalidParent) {
			t.Errorf("into my folder: err = %v, want ErrInvalidParent", err)
		}
		if p := parentOf(t, db, other, theirs.ID); p != nil {
			t.Errorf("their note moved into my folder: parent = %v", p)
		}
	})
}

func TestItemsDeleteCascades(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	top := mustCreate(t, db, me, model.ItemTypeFolder, "Top", nil)
	sub := mustCreate(t, db, me, model.ItemTypeFolder, "Sub", &top.ID)
	deep := mustCreate(t, db, me, model.ItemTypeNote, "Deep", &sub.ID)
	keep := mustCreate(t, db, me, model.ItemTypeNote, "Keep", nil)

	if err := db.DeleteItem(me, top.ID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []uuid.UUID{top.ID, sub.ID, deep.ID} {
		if _, err := db.GetItem(me, id); !isNotFound(err) {
			t.Errorf("item %v survived: err = %v", id, err)
		}
	}
	var contents int
	_ = pool.QueryRow(context.Background(), "SELECT count(*) FROM note_contents").Scan(&contents)
	if contents != 1 {
		t.Errorf("%d content rows left, want only Keep's", contents)
	}
	if _, err := db.GetItem(me, keep.ID); err != nil {
		t.Errorf("an unrelated note was deleted: %v", err)
	}
	if err := db.DeleteItem(me, top.ID); !isNotFound(err) {
		t.Errorf("deleting twice: err = %v, want not found", err)
	}
}

func TestItemsContent(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)
	folder := mustCreate(t, db, me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, db, me, model.ItemTypeNote, "Note", nil)

	got, err := db.GetNoteContent(me, note.ID)
	if err != nil || got.Content != "content of Note" {
		t.Fatalf("GetNoteContent = %+v, %v", got, err)
	}

	saved, err := db.PutNoteContent(me, note.ID, "<p>new</p>")
	if err != nil || saved.Content != "<p>new</p>" {
		t.Fatalf("PutNoteContent = %+v, %v", saved, err)
	}
	if again, _ := db.GetNoteContent(me, note.ID); again.Content != "<p>new</p>" {
		t.Errorf("content = %q, want it persisted", again.Content)
	}
	item, _ := db.GetItem(me, note.ID)
	if !item.UpdatedAt.After(note.UpdatedAt) {
		t.Error("saving content must bump the note's updated_at")
	}
	if _, err := db.PutNoteContent(me, note.ID, ""); err != nil {
		t.Errorf("saving an empty body: %v", err)
	}

	if _, err := db.GetNoteContent(me, folder.ID); !errors.Is(err, database.ErrNotANote) {
		t.Errorf("folder content err = %v, want ErrNotANote", err)
	}
	if _, err := db.PutNoteContent(me, folder.ID, "x"); !errors.Is(err, database.ErrNotANote) {
		t.Errorf("folder put err = %v, want ErrNotANote", err)
	}
	if _, err := db.PutNoteContent(other, note.ID, "hijacked"); !isNotFound(err) {
		t.Errorf("another user's put err = %v, want not found", err)
	}
	if again, _ := db.GetNoteContent(me, note.ID); again.Content != "" {
		t.Errorf("content = %q: another user's put must change nothing", again.Content)
	}
	if _, err := db.PutNoteContent(me, note.ID, strings.Repeat("a", services.MaxContentBytes+1)); err == nil {
		t.Error("content over the limit must be rejected by the database as well")
	}
}

func TestItemsDuplicateCopiesSubtreeAndContent(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	top := mustCreate(t, db, me, model.ItemTypeFolder, "Top", nil)
	sub := mustCreate(t, db, me, model.ItemTypeFolder, "Sub", &top.ID)
	mustCreate(t, db, me, model.ItemTypeNote, "Deep", &sub.ID)
	mustCreate(t, db, me, model.ItemTypeNote, "Shallow", &top.ID)

	snapshot, _ := db.ListItems(me, model.ItemFilter{})
	plan, err := services.PlanDuplicate(me, snapshot, top.ID, uuid.New)
	if err != nil {
		t.Fatal(err)
	}
	root, err := db.ApplyDuplicate(plan)
	if err != nil {
		t.Fatal(err)
	}
	if root.Name != "Top (Copy 1)" || root.ParentID != nil || root.ID == top.ID {
		t.Errorf("root copy = %+v", root)
	}

	var items, contents int
	_ = pool.QueryRow(context.Background(), "SELECT count(*) FROM items").Scan(&items)
	_ = pool.QueryRow(context.Background(), "SELECT count(*) FROM note_contents").Scan(&contents)
	if items != 8 || contents != 4 {
		t.Errorf("%d items and %d contents, want 8 and 4", items, contents)
	}

	kids, _ := db.ListItems(me, model.ItemFilter{ParentSet: true, ParentID: &root.ID})
	if len(kids) != 2 || kids[0].Name != "Sub" || kids[1].Name != "Shallow" {
		t.Fatalf("copied children = %+v, want [Sub, Shallow]", kids)
	}
	grand, _ := db.ListItems(me, model.ItemFilter{ParentSet: true, ParentID: &kids[0].ID})
	if len(grand) != 1 || grand[0].Name != "Deep" {
		t.Fatalf("copied grandchildren = %+v, want [Deep]", grand)
	}
	if c, err := db.GetNoteContent(me, grand[0].ID); err != nil || c.Content != "content of Deep" {
		t.Errorf("copied content = %+v, %v", c, err)
	}
	if c, _ := db.GetNoteContent(me, grand[0].ID); c.ItemID == uuid.Nil {
		t.Error("copied content row has no item id")
	}
}

func TestItemsDuplicateIsAtomic(t *testing.T) {
	db, pool := newItemsDB(t)
	me, other := newUser(t, pool), newUser(t, pool)
	folder := mustCreate(t, db, me, model.ItemTypeFolder, "Folder", nil)
	mustCreate(t, db, me, model.ItemTypeNote, "Inside", &folder.ID)
	theirs := mustCreate(t, db, other, model.ItemTypeNote, "Theirs", nil)

	snapshot, _ := db.ListItems(me, model.ItemFilter{})
	plan, err := services.PlanDuplicate(me, snapshot, folder.ID, uuid.New)
	if err != nil {
		t.Fatal(err)
	}
	plan.Copies[len(plan.Copies)-1].SourceID = theirs.ID

	if _, err := db.ApplyDuplicate(plan); !errors.Is(err, database.ErrMoveConflict) {
		t.Errorf("err = %v, want ErrMoveConflict", err)
	}
	var items int
	_ = pool.QueryRow(context.Background(), "SELECT count(*) FROM items").Scan(&items)
	if items != 3 {
		t.Errorf("%d items stored, want 3: a failed duplicate must create nothing", items)
	}
}

func ptr[T any](v T) *T { return &v }
