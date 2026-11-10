package tree_test

import (
	"maps"
	"reflect"
	"slices"
	"strings"
	"testing"

	"backend/internal/apperr"
	"backend/internal/model"
	"backend/internal/testutil"
	"backend/internal/tree"

	"github.com/google/uuid"
)

type fixture struct {
	t    *testing.T
	db   *testutil.FakeItemStore
	user uuid.UUID
	ws   uuid.UUID
}

func newFixture(t *testing.T) *fixture {
	db := testutil.NewFakeItemStore()
	user := uuid.New()
	return &fixture{t: t, db: db, user: user, ws: db.Workspace(user).ID}
}

func ptr[T any](v T) *T { return &v }

func text(s string) []any {
	return []any{map[string]any{"type": "text", "text": s, "styles": map[string]any{}}}
}

func createPage(id, parent uuid.UUID, pos *int, name string) model.Op {
	return model.Op{Op: model.OpCreate, ID: id, Type: ptr(model.ItemTypePage), ParentID: &parent, Position: pos,
		Props: model.Props{"name": name}}
}

func createBlock(id, parent uuid.UUID, pos *int, typ model.ItemType, s string) model.Op {
	props := model.Props{"content": text(s)}
	if typ == model.ItemTypeHeading {
		props["level"] = 1
	}
	return model.Op{Op: model.OpCreate, ID: id, Type: &typ, ParentID: &parent, Position: pos, Props: props}
}

func update(id uuid.UUID, props model.Props) model.Op {
	return model.Op{Op: model.OpUpdate, ID: id, Props: props}
}

func move(id, parent uuid.UUID, pos *int) model.Op {
	return model.Op{Op: model.OpMove, ID: id, ParentID: &parent, Position: pos}
}

func (f *fixture) apply(ops ...model.Op) {
	f.t.Helper()
	if err := f.db.ApplyOps(ctx, f.user, ops); err != nil {
		f.t.Fatalf("apply: %v", err)
	}
}

// reject applies ops, wants an apperr of the given kind at index, and checks
// that nothing changed.
func (f *fixture) reject(kind apperr.Kind, index int, ops ...model.Op) {
	f.t.Helper()
	before := maps.Clone(f.db.Items)
	err := f.db.ApplyOps(ctx, f.user, ops)
	e, ok := apperr.As(err)
	if !ok || e.OpIndex == nil {
		f.t.Fatalf("err = %v, want an apperr naming an operation", err)
	}
	if e.Kind != kind || *e.OpIndex != index {
		f.t.Errorf("rejected with kind %d at %d (%s), want kind %d at %d", e.Kind, *e.OpIndex, e.Msg, kind, index)
	}
	if !reflect.DeepEqual(before, f.db.Items) {
		f.t.Error("a rejected batch changed the tree")
	}
}

func (f *fixture) item(id uuid.UUID) model.Item {
	f.t.Helper()
	it, ok := f.db.Items[id]
	if !ok {
		f.t.Fatalf("item %s does not exist", id)
	}
	return it
}

func (f *fixture) children(id uuid.UUID) []uuid.UUID { return f.item(id).ChildIDs }

func wantIDs(t *testing.T, what string, got []uuid.UUID, want ...uuid.UUID) {
	t.Helper()
	if !slices.Equal(got, want) {
		t.Errorf("%s = %v, want %v", what, got, want)
	}
}

// page builds Page > [a, b > [b1], c] and returns the ids.
func (f *fixture) page() (page, a, b, b1, c uuid.UUID) {
	page, a, b, b1, c = uuid.New(), uuid.New(), uuid.New(), uuid.New(), uuid.New()
	f.apply(
		createPage(page, f.ws, nil, "Page"),
		createBlock(a, page, nil, model.ItemTypeParagraph, "a"),
		createBlock(b, page, nil, model.ItemTypeBulletListItem, "b"),
		createBlock(b1, b, nil, model.ItemTypeBulletListItem, "b1"),
		createBlock(c, page, nil, model.ItemTypeParagraph, "c"),
	)
	return
}

func TestCreatePositions(t *testing.T) {
	f := newFixture(t)
	page, a, b, b1, c := f.page()
	wantIDs(t, "workspace", f.children(f.ws), page)
	wantIDs(t, "page", f.children(page), a, b, c)
	wantIDs(t, "b", f.children(b), b1)

	first, mid, end := uuid.New(), uuid.New(), uuid.New()
	f.apply(
		createBlock(first, page, ptr(0), model.ItemTypeQuote, "first"),
		createBlock(mid, page, ptr(3), model.ItemTypeQuote, "mid"),
		createBlock(end, page, ptr(5), model.ItemTypeQuote, "end"),
	)
	wantIDs(t, "page", f.children(page), first, a, b, mid, c, end)
}

func TestCreateFillsProps(t *testing.T) {
	f := newFixture(t)
	page, check := uuid.New(), uuid.New()
	f.apply(
		model.Op{Op: model.OpCreate, ID: page, Type: ptr(model.ItemTypePage), ParentID: &f.ws,
			Props: model.Props{"is_favorite": "yes", "cover": "sky.png"}},
		model.Op{Op: model.OpCreate, ID: check, Type: ptr(model.ItemTypeCheckListItem), ParentID: &page},
	)
	want := model.Props{"name": model.DefaultPageName, "icon": model.DefaultPageIcon, "is_favorite": false, "cover": "sky.png"}
	if got := f.item(page).Props; !reflect.DeepEqual(got, want) {
		t.Errorf("page props = %v, want %v", got, want)
	}
	if got := f.item(check).Props; !reflect.DeepEqual(got, model.Props{"content": []any{}, "checked": false}) {
		t.Errorf("checklist props = %v", got)
	}
}

func TestUpdateMergesProps(t *testing.T) {
	f := newFixture(t)
	page, a, b, _, c := f.page()
	check := uuid.New()
	f.apply(model.Op{Op: model.OpCreate, ID: check, Type: ptr(model.ItemTypeCheckListItem), ParentID: &page,
		Props: model.Props{"checked": true, "textColor": "red"}})
	before := maps.Clone(f.db.Items)

	f.apply(
		update(c, model.Props{"content": text("changed"), "backgroundColor": "blue"}),
		update(check, model.Props{"checked": "yes", "textColor": nil}),
		update(page, model.Props{"name": "  Renamed  ", "icon": "", "is_favorite": true}),
	)
	if got := f.item(c).Props; !reflect.DeepEqual(got, model.Props{"content": text("changed"), "backgroundColor": "blue"}) {
		t.Errorf("c props = %v", got)
	}
	if got := f.item(check).Props; got["checked"] != true || got["textColor"] != "red" {
		t.Errorf("checklist props = %v: a wrong value and a null must both be ignored", got)
	}
	if got := f.item(page).Props; got["name"] != "Renamed" || got["icon"] != model.DefaultPageIcon || got["is_favorite"] != true {
		t.Errorf("page props = %v: name trimmed, empty icon ignored, favourite set", got)
	}
	for _, id := range []uuid.UUID{c, check, page} {
		if !f.item(id).UpdatedAt.After(before[id].UpdatedAt) {
			t.Errorf("%s: updated_at not bumped", id)
		}
	}
	for _, id := range []uuid.UUID{a, b} {
		if !f.item(id).UpdatedAt.Equal(before[id].UpdatedAt) {
			t.Errorf("%s: an untouched block got a new updated_at", id)
		}
	}
}

func TestUpdateTurnInto(t *testing.T) {
	f := newFixture(t)
	_, a, b, _, _ := f.page()

	f.apply(model.Op{Op: model.OpUpdate, ID: a, Type: ptr(model.ItemTypeHeading), Props: model.Props{"level": 2}})
	if got := f.item(a); got.Type != model.ItemTypeHeading || got.Props["level"] != 2 || !reflect.DeepEqual(got.Props["content"], text("a")) {
		t.Errorf("turn into heading: %+v; want level 2 and the text kept", got)
	}
	f.apply(model.Op{Op: model.OpUpdate, ID: a, Type: ptr(model.ItemTypeParagraph)})
	if got := f.item(a); got.Type != model.ItemTypeParagraph || got.Props["level"] != 2 {
		t.Errorf("turn back: %+v; want the level key kept", got)
	}
	f.apply(model.Op{Op: model.OpUpdate, ID: b, Type: ptr(model.ItemTypeCheckListItem)})
	if got := f.item(b).Props["checked"]; got != false {
		t.Errorf("turn into checklist: checked = %v, want the default", got)
	}
	f.reject(apperr.Invalid, 0, model.Op{Op: model.OpUpdate, ID: b, Type: ptr(model.ItemTypeHeading)})
	f.reject(apperr.Invalid, 0, model.Op{Op: model.OpUpdate, ID: b, Type: ptr(model.ItemTypeHeading), Props: model.Props{"level": 7}})
}

func TestMovePositions(t *testing.T) {
	f := newFixture(t)
	page, a, b, b1, c := f.page()

	// Within one parent the position is the final index.
	f.apply(move(a, page, ptr(2)))
	wantIDs(t, "page", f.children(page), b, c, a)
	f.apply(move(a, page, ptr(0)))
	wantIDs(t, "page", f.children(page), a, b, c)

	// Tab on c: it becomes b's last child.
	f.apply(move(c, b, nil))
	wantIDs(t, "page", f.children(page), a, b)
	wantIDs(t, "b", f.children(b), b1, c)
	if *f.item(c).ParentID != b {
		t.Error("parent_id not updated")
	}

	// A page can move under a block, and back to the top level.
	other := uuid.New()
	f.apply(createPage(other, f.ws, nil, "Other"))
	f.apply(move(other, b1, nil))
	wantIDs(t, "workspace", f.children(f.ws), page)
	wantIDs(t, "b1", f.children(b1), other)
	f.apply(move(other, f.ws, ptr(0)))
	wantIDs(t, "workspace", f.children(f.ws), other, page)
}

// A page added or moved to the end of a page without a position goes before the
// trailing empty paragraph; anything else still goes last.
func TestPageAtEndGoesBeforeTrailingParagraph(t *testing.T) {
	f := newFixture(t)
	page, a, trailing := uuid.New(), uuid.New(), uuid.New()
	f.apply(
		createPage(page, f.ws, nil, "Page"),
		createBlock(a, page, nil, model.ItemTypeParagraph, "a"),
		model.Op{Op: model.OpCreate, ID: trailing, Type: ptr(model.ItemTypeParagraph), ParentID: &page},
	)

	child, other, block := uuid.New(), uuid.New(), uuid.New()
	f.apply(createPage(child, page, nil, "Child"))
	wantIDs(t, "after create", f.children(page), a, child, trailing)

	f.apply(createPage(other, f.ws, nil, "Other"), move(other, page, nil))
	wantIDs(t, "after move", f.children(page), a, child, other, trailing)

	f.apply(createBlock(block, page, nil, model.ItemTypeQuote, "q"))
	wantIDs(t, "a block still goes last", f.children(page), a, child, other, trailing, block)

	// The last child is no longer an empty paragraph, so a page goes last too.
	last := uuid.New()
	f.apply(createPage(last, page, nil, "Last"))
	wantIDs(t, "no trailing paragraph", f.children(page), a, child, other, trailing, block, last)

	// An explicit position is always taken as given.
	f.apply(move(child, page, ptr(5)))
	wantIDs(t, "explicit position", f.children(page), a, other, trailing, block, last, child)
}

func TestDeleteBlockTrashesChildPages(t *testing.T) {
	f := newFixture(t)
	page, a, b, b1, c := f.page()
	child, inChild, deepPage := uuid.New(), uuid.New(), uuid.New()
	f.apply(
		createPage(child, b1, nil, "Child"),
		createBlock(inChild, child, nil, model.ItemTypeParagraph, "inside"),
		createPage(deepPage, inChild, nil, "Deep"),
	)

	f.apply(model.Op{Op: model.OpDelete, ID: b})
	wantIDs(t, "page", f.children(page), a, c)
	for _, gone := range []uuid.UUID{b, b1} {
		if _, ok := f.db.Items[gone]; ok {
			t.Errorf("%s was not deleted", gone)
		}
	}
	if ch := f.item(child); *ch.ParentID != f.ws || ch.TrashedAt == nil {
		t.Errorf("child page = %+v, want it in the trash under the workspace", ch)
	}
	wantIDs(t, "workspace", f.children(f.ws), page)
	if d := f.item(deepPage); *d.ParentID != inChild || d.TrashedAt != nil {
		t.Error("a page inside the trashed page should stay where it is")
	}
	if pages, _ := f.db.ListPages(ctx, f.user); len(pages) != 1 {
		t.Errorf("sidebar = %+v, want only Page", pages)
	}

	// Undo re-creates the block with the same id.
	f.apply(createBlock(b, page, ptr(1), model.ItemTypeBulletListItem, "b"))
	wantIDs(t, "page", f.children(page), a, b, c)
}

func TestTrashPage(t *testing.T) {
	f := newFixture(t)
	page, _, _, b1, _ := f.page()
	child := uuid.New()
	f.apply(createPage(child, b1, nil, "Child"))

	f.apply(model.Op{Op: model.OpTrash, ID: child})
	wantIDs(t, "b1", f.children(b1))
	if it := f.item(child); *it.ParentID != f.ws || it.TrashedAt == nil {
		t.Errorf("trashed page = %+v", it)
	}
	wantIDs(t, "workspace", f.children(f.ws), page)
}

func TestRejections(t *testing.T) {
	f := newFixture(t)
	page, a, b, b1, c := f.page()
	trashed, inTrash := uuid.New(), uuid.New()
	f.apply(
		createPage(trashed, f.ws, nil, "Trashed"),
		createBlock(inTrash, trashed, nil, model.ItemTypeParagraph, "x"),
		model.Op{Op: model.OpTrash, ID: trashed},
	)
	other := &fixture{t: t, db: f.db, user: uuid.New()}
	other.ws = f.db.Workspace(other.user).ID
	theirs := uuid.New()
	other.apply(createPage(theirs, other.ws, nil, "Theirs"))
	big := strings.Repeat("x", 40<<10)
	f.apply(update(c, model.Props{"note": big}))
	good := update(a, model.Props{"content": text("ok")})

	cases := []struct {
		name string
		kind apperr.Kind
		op   model.Op
	}{
		{"unknown type", apperr.Invalid, createBlock(uuid.New(), page, nil, "codeBlock", "x")},
		{"another user's item", apperr.NotFound, update(theirs, model.Props{"name": "x"})},
		{"another user's parent", apperr.NotFound, createBlock(uuid.New(), theirs, nil, model.ItemTypeParagraph, "x")},
		{"unknown item", apperr.NotFound, model.Op{Op: model.OpDelete, ID: uuid.New()}},
		{"the workspace", apperr.NotFound, move(f.ws, page, nil)},
		{"edit inside a trashed page", apperr.Conflict, update(inTrash, model.Props{"content": text("y")})},
		{"create inside a trashed page", apperr.Conflict, createBlock(uuid.New(), inTrash, nil, model.ItemTypeParagraph, "x")},
		{"move into a trashed page", apperr.Conflict, move(a, trashed, nil)},
		{"trash a trashed page", apperr.Conflict, model.Op{Op: model.OpTrash, ID: trashed}},
		{"create past the end", apperr.Conflict, createBlock(uuid.New(), page, ptr(4), model.ItemTypeParagraph, "x")},
		{"move past the end", apperr.Conflict, move(a, page, ptr(3))},
		{"cycle", apperr.Conflict, move(b, b1, nil)},
		{"into itself", apperr.Conflict, move(b, b, nil)},
		{"page into its own block", apperr.Conflict, move(page, b1, nil)},
		{"delete a page", apperr.Invalid, model.Op{Op: model.OpDelete, ID: page}},
		{"trash a block", apperr.Invalid, model.Op{Op: model.OpTrash, ID: a}},
		{"block into page", apperr.Invalid, model.Op{Op: model.OpUpdate, ID: a, Type: ptr(model.ItemTypePage)}},
		{"page into block", apperr.Invalid, model.Op{Op: model.OpUpdate, ID: page, Type: ptr(model.ItemTypeQuote)}},
		{"block at the top level", apperr.Invalid, createBlock(uuid.New(), f.ws, nil, model.ItemTypeParagraph, "x")},
		{"block moved to the top level", apperr.Invalid, move(a, f.ws, nil)},
		{"heading without level", apperr.Invalid, model.Op{Op: model.OpCreate, ID: uuid.New(), Type: ptr(model.ItemTypeHeading), ParentID: &page}},
		{"props too large after merge", apperr.Invalid, update(c, model.Props{"more": big})},
		{"existing id", apperr.Conflict, createBlock(a, page, nil, model.ItemTypeParagraph, "x")},
		{"another user's id", apperr.Conflict, createBlock(theirs, page, nil, model.ItemTypeParagraph, "x")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			f.t = t
			// A good op first: the whole batch must still roll back.
			f.reject(tc.kind, 1, good, tc.op)
		})
	}
}

func TestOpsSeeEarlierOpsInTheBatch(t *testing.T) {
	f := newFixture(t)
	page, _, _, _, c := f.page()
	x := uuid.New()
	f.apply(
		createBlock(x, page, ptr(1), model.ItemTypeParagraph, "x"),
		move(c, x, nil),
		model.Op{Op: model.OpDelete, ID: x},
	)
	if _, ok := f.db.Items[c]; ok {
		t.Error("c should have been deleted with x")
	}
	f.reject(apperr.NotFound, 0, update(x, model.Props{"content": text("gone")}))
}

func TestDuplicatePage(t *testing.T) {
	f := newFixture(t)
	page, a, b, b1, _ := f.page()
	child, after := uuid.New(), uuid.New()
	f.apply(
		createPage(child, b1, nil, "Child"),
		update(child, model.Props{"is_favorite": true}),
		createPage(after, f.ws, nil, "After"),
		update(page, model.Props{"is_favorite": true}),
	)
	before := len(f.db.Items)

	copied, err := f.db.Duplicate(ctx, f.user, page)
	if err != nil {
		t.Fatal(err)
	}
	if copied.Name() != "Page (Copy 1)" || copied.Props["is_favorite"] != false || copied.ID == page {
		t.Errorf("copy = %+v", copied)
	}
	if f.item(page).Props["is_favorite"] != true || f.item(page).Name() != "Page" {
		t.Error("duplicating changed the original")
	}
	wantIDs(t, "workspace", f.children(f.ws), page, copied.ID, after)
	if got := len(f.db.Items) - before; got != 6 {
		t.Errorf("copied %d items, want 6 (page, 4 blocks, child page)", got)
	}

	// The copy has the same shape with new ids, child page included.
	kids := f.children(copied.ID)
	if len(kids) != 3 || slices.Contains(kids, a) {
		t.Fatalf("copy children = %v", kids)
	}
	cb := f.item(kids[1])
	if cb.Type != model.ItemTypeBulletListItem || len(cb.ChildIDs) != 1 || cb.ID == b {
		t.Fatalf("copied b = %+v", cb)
	}
	cchild := f.item(f.item(cb.ChildIDs[0]).ChildIDs[0])
	if cchild.Type != model.ItemTypePage || cchild.Name() != "Child" || cchild.ID == child || cchild.Props["is_favorite"] != false {
		t.Errorf("copied child page = %+v", cchild)
	}

	again, err := f.db.Duplicate(ctx, f.user, page)
	if err != nil {
		t.Fatal(err)
	}
	if again.Name() != "Page (Copy 2)" {
		t.Errorf("second copy name = %q", again.Name())
	}
	wantIDs(t, "workspace", f.children(f.ws), page, again.ID, copied.ID, after)
}

func TestDuplicateBlockAndRejections(t *testing.T) {
	f := newFixture(t)
	page, a, b, _, c := f.page()

	copied, err := f.db.Duplicate(ctx, f.user, b)
	if err != nil {
		t.Fatal(err)
	}
	wantIDs(t, "page", f.children(page), a, b, copied.ID, c)
	if _, hasName := copied.Props["name"]; hasName || len(copied.ChildIDs) != 1 {
		t.Errorf("block copy = %+v", copied)
	}

	f.apply(model.Op{Op: model.OpTrash, ID: page})
	if _, err := f.db.Duplicate(ctx, f.user, a); !apperr.Is(err, apperr.Conflict) {
		t.Errorf("duplicate inside the trash: err = %v", err)
	}
	if _, err := f.db.Duplicate(ctx, f.user, f.ws); !apperr.Is(err, apperr.NotFound) {
		t.Errorf("duplicate the workspace: err = %v", err)
	}
}

func TestCloneName(t *testing.T) {
	occupied := map[string]bool{"Notes (Copy 1)": true}
	if got := tree.CloneName("Notes", occupied); got != "Notes (Copy 2)" {
		t.Errorf("got %q", got)
	}
	if got := tree.CloneName("Notes (Copy 1)", occupied); got != "Notes (Copy 2)" {
		t.Errorf("copy of a copy = %q", got)
	}
	if got := []rune(tree.CloneName(strings.Repeat("a", model.MaxNameLength), nil)); len(got) != model.MaxNameLength {
		t.Errorf("long name copy has %d runes", len(got))
	}
}
