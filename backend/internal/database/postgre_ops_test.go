package database_test

import (
	"context"
	"encoding/json"
	"errors"
	"reflect"
	"slices"
	"sync"
	"testing"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/tree"

	"github.com/google/uuid"
)

func ptr[T any](v T) *T { return &v }

func runs(s string) []any {
	return []any{map[string]any{"type": "text", "text": s, "styles": map[string]any{}}}
}

// sameJSON compares values by their JSON form, since JSONB does not keep Go types
// (ints come back as float64).
func sameJSON(a, b any) bool {
	x, _ := json.Marshal(a)
	y, _ := json.Marshal(b)
	var u, v any
	_ = json.Unmarshal(x, &u)
	_ = json.Unmarshal(y, &v)
	return reflect.DeepEqual(u, v)
}

func pageOp(id, parent uuid.UUID, pos *int, name string) model.Op {
	return model.Op{Op: model.OpCreate, ID: id, Type: ptr(model.ItemTypePage), ParentID: &parent, Position: pos, Props: model.Props{"name": name}}
}

func blockOp(id, parent uuid.UUID, pos *int, s string) model.Op {
	return model.Op{Op: model.OpCreate, ID: id, Type: ptr(model.ItemTypeParagraph), ParentID: &parent, Position: pos, Props: model.Props{"content": runs(s)}}
}

func mustGet(t *testing.T, db *database.PostgreItemsDataSource, user, id uuid.UUID) model.Item {
	t.Helper()
	it, err := db.GetItem(user, id)
	if err != nil {
		t.Fatalf("getting %s: %v", id, err)
	}
	return it
}

func TestPostgresApplyOps(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID
	page, a, b, child := uuid.New(), uuid.New(), uuid.New(), uuid.New()

	if err := db.ApplyOps(me, []model.Op{
		pageOp(page, ws, nil, "Page"),
		blockOp(b, page, nil, "b"),
		blockOp(a, page, ptr(0), "a"),
		pageOp(child, b, nil, "Child"),
	}); err != nil {
		t.Fatal(err)
	}
	if got := mustGet(t, db, me, page); !slices.Equal(got.ChildIDs, []uuid.UUID{a, b}) || got.Props["icon"] != model.DefaultPageIcon {
		t.Errorf("page = %+v", got)
	}
	before := mustGet(t, db, me, a)

	if err := db.ApplyOps(me, []model.Op{
		{Op: model.OpUpdate, ID: b, Type: ptr(model.ItemTypeHeading), Props: model.Props{"level": 1, "textColor": "red"}},
		{Op: model.OpMove, ID: b, ParentID: &page, Position: ptr(0)},
	}); err != nil {
		t.Fatal(err)
	}
	if got := mustGet(t, db, me, page).ChildIDs; !slices.Equal(got, []uuid.UUID{b, a}) {
		t.Errorf("after move, page children = %v", got)
	}
	if after := mustGet(t, db, me, a); !after.UpdatedAt.Equal(before.UpdatedAt) {
		t.Error("an untouched block got a new updated_at")
	}
	want := model.Props{"content": runs("b"), "level": 1, "textColor": "red"}
	if got := mustGet(t, db, me, b); got.Type != model.ItemTypeHeading || !sameJSON(got.Props, want) {
		t.Errorf("turn into = %+v, want props %v", got, want)
	}

	if err := db.ApplyOps(me, []model.Op{{Op: model.OpDelete, ID: b}}); err != nil {
		t.Fatal(err)
	}
	if _, err := db.GetItem(me, b); !isNotFound(err) {
		t.Errorf("deleted block: err = %v", err)
	}
	if got := mustGet(t, db, me, child); got.TrashedAt == nil || *got.ParentID != ws {
		t.Errorf("child page after its block was deleted = %+v; want it in the trash", got)
	}
	if got := mustGet(t, db, me, ws).ChildIDs; !slices.Equal(got, []uuid.UUID{page}) {
		t.Errorf("workspace children = %v", got)
	}

	if err := db.ApplyOps(me, []model.Op{{Op: model.OpTrash, ID: page}}); err != nil {
		t.Fatal(err)
	}
	if pages, _ := db.ListPages(me); len(pages) != 0 {
		t.Errorf("sidebar after trashing = %+v", pages)
	}
}

func TestPostgresApplyOpsRollsBack(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID
	page, a := uuid.New(), uuid.New()
	if err := db.ApplyOps(me, []model.Op{pageOp(page, ws, nil, "Page"), blockOp(a, page, nil, "a")}); err != nil {
		t.Fatal(err)
	}

	added := uuid.New()
	err := db.ApplyOps(me, []model.Op{
		blockOp(added, page, nil, "added"),
		{Op: model.OpUpdate, ID: a, Props: model.Props{"content": runs("changed")}},
		{Op: model.OpMove, ID: page, ParentID: &a},
	})
	var te *tree.Error
	if !errors.As(err, &te) || te.Kind != tree.Conflict || te.Index != 2 {
		t.Fatalf("err = %v, want a conflict at op 2", err)
	}
	if _, err := db.GetItem(me, added); !isNotFound(err) {
		t.Error("the create before the rejected op was kept")
	}
	if got := mustGet(t, db, me, a); !sameJSON(got.Props["content"], runs("a")) {
		t.Error("the update before the rejected op was kept")
	}
	if got := mustGet(t, db, me, page).ChildIDs; !slices.Equal(got, []uuid.UUID{a}) {
		t.Errorf("page children = %v", got)
	}

	other := newUser(t, pool)
	if err := db.ApplyOps(other, []model.Op{{Op: model.OpUpdate, ID: a, Props: model.Props{"x": 1}}}); !errors.As(err, &te) || te.Kind != tree.NotFound {
		t.Errorf("another user's block: err = %v", err)
	}
}

func TestPostgresApplyOpsChecksChildIDs(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID
	page := uuid.New()
	if err := db.ApplyOps(me, []model.Op{pageOp(page, ws, nil, "Page")}); err != nil {
		t.Fatal(err)
	}
	// A child the page does not list: any batch touching the page must fail.
	if _, err := pool.Exec(context.Background(),
		"INSERT INTO items (id, user_id, parent_id, type) VALUES ($1, $2, $3, 'paragraph')", uuid.New(), me, page); err != nil {
		t.Fatal(err)
	}
	err := db.ApplyOps(me, []model.Op{blockOp(uuid.New(), page, nil, "x")})
	var te *tree.Error
	if err == nil || errors.As(err, &te) {
		t.Errorf("err = %v, want an internal child_ids error", err)
	}
}

func TestPostgresConcurrentBatchesKeepChildIDs(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID
	page := uuid.New()
	if err := db.ApplyOps(me, []model.Op{pageOp(page, ws, nil, "Page")}); err != nil {
		t.Fatal(err)
	}

	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- db.ApplyOps(me, []model.Op{blockOp(uuid.New(), page, ptr(0), "x")})
		}()
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Error(err)
		}
	}
	if got := mustGet(t, db, me, page).ChildIDs; len(got) != 20 {
		t.Errorf("page has %d children listed, want 20", len(got))
	}
}

func TestPostgresDuplicate(t *testing.T) {
	db, pool := newItemsDB(t)
	me := newUser(t, pool)
	ws := workspaceOf(t, db, me).ID
	page, a, child, after := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	if err := db.ApplyOps(me, []model.Op{
		pageOp(page, ws, nil, "Page"),
		{Op: model.OpUpdate, ID: page, Props: model.Props{"is_favorite": true}},
		blockOp(a, page, nil, "a"),
		pageOp(child, a, nil, "Child"),
		pageOp(after, ws, nil, "After"),
	}); err != nil {
		t.Fatal(err)
	}

	copied, err := db.Duplicate(me, page)
	if err != nil {
		t.Fatal(err)
	}
	if copied.Name() != "Page (Copy 1)" || copied.Props["is_favorite"] != false {
		t.Errorf("copy = %+v", copied)
	}
	if got := mustGet(t, db, me, ws).ChildIDs; !slices.Equal(got, []uuid.UUID{page, copied.ID, after}) {
		t.Errorf("workspace children = %v", got)
	}
	items, err := db.GetPageTree(me, copied.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 3 || items[1].ID == a || items[2].Name() != "Child" || items[2].ID == child {
		t.Errorf("copied tree = %+v", items)
	}
	if pages, _ := db.ListPages(me); len(pages) != 5 {
		t.Errorf("sidebar has %d pages, want 5", len(pages))
	}
}
