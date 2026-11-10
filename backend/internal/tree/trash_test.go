package tree_test

import (
	"errors"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/tree"

	"github.com/google/uuid"
)

func trash(id uuid.UUID) model.Op { return model.Op{Op: model.OpTrash, ID: id} }

func restore(id uuid.UUID, parent *uuid.UUID, pos *int) model.Op {
	return model.Op{Op: model.OpRestore, ID: id, ParentID: parent, Position: pos}
}

// trashedChild builds Page > [a, b > [b1 > Child > [inside > Deep]], c], trashes
// Child, and returns the ids.
func (f *fixture) trashedChild() (page, b1, child, inside, deep uuid.UUID) {
	page, _, _, b1, _ = f.page()
	child, inside, deep = uuid.New(), uuid.New(), uuid.New()
	f.apply(
		createPage(child, b1, nil, "Child"),
		createBlock(inside, child, nil, model.ItemTypeParagraph, "inside"),
		createPage(deep, inside, nil, "Deep"),
		update(child, model.Props{"is_favorite": true}),
	)
	f.apply(trash(child))
	return
}

func TestRestoreToTheEndOfTheTopLevel(t *testing.T) {
	f := newFixture(t)
	page, b1, child, inside, deep := f.trashedChild()

	f.apply(restore(child, nil, nil))
	it := f.item(child)
	if it.TrashedAt != nil || *it.ParentID != f.ws {
		t.Fatalf("restored page = %+v, want it at the top level", it)
	}
	wantIDs(t, "workspace", f.children(f.ws), page, child)
	wantIDs(t, "b1", f.children(b1))
	// What was inside comes back with it, and it stays a favorite.
	wantIDs(t, "child", f.children(child), inside)
	if *f.item(deep).ParentID != inside {
		t.Error("the page inside moved")
	}
	if it.Props["is_favorite"] != true {
		t.Error("the restored page lost its favorite flag")
	}
	if pages, _ := f.db.ListPages(ctx, f.user); len(pages) != 3 {
		t.Errorf("sidebar = %d pages, want Page, Child and Deep", len(pages))
	}
}

func TestRestoreToItsOldPlace(t *testing.T) {
	f := newFixture(t)
	_, b1, child, _, _ := f.trashedChild()
	other := uuid.New()
	f.apply(createBlock(other, b1, nil, model.ItemTypeParagraph, "other"))

	f.apply(restore(child, &b1, ptr(0)))
	wantIDs(t, "b1", f.children(b1), child, other)
	if f.item(child).TrashedAt != nil {
		t.Error("still in the trash")
	}
}

func TestTrashAndRestoreInOneBatch(t *testing.T) {
	f := newFixture(t)
	page, a, b, _, c := f.page()
	sub := uuid.New()
	f.apply(createPage(sub, page, ptr(1), "Sub"))
	f.apply(trash(sub), restore(sub, &page, ptr(1)))
	wantIDs(t, "page", f.children(page), a, sub, b, c)
}

func TestRestoreRejections(t *testing.T) {
	f := newFixture(t)
	page, b1, child, inside, deep := f.trashedChild()
	block := f.children(page)[0]

	f.reject(tree.Conflict, 0, restore(page, nil, nil)) // not in the trash
	f.reject(tree.Conflict, 0, restore(deep, nil, nil)) // inside a trashed page
	f.reject(tree.Invalid, 0, restore(block, nil, nil)) // a block
	f.reject(tree.NotFound, 0, restore(uuid.New(), nil, nil))
	f.reject(tree.Conflict, 0, restore(child, &inside, nil)) // into itself
	f.reject(tree.Conflict, 0, restore(child, &b1, ptr(5)))  // position out of range
	other := uuid.New()
	f.apply(createPage(other, f.ws, nil, "Other"), trash(other))
	f.reject(tree.Conflict, 0, restore(child, &other, nil)) // into another trashed page
}

func TestListAndDeleteFromTrash(t *testing.T) {
	f := newFixture(t)
	_, _, child, inside, deep := f.trashedChild()
	later := uuid.New()
	f.apply(createPage(later, f.ws, nil, "Later"))
	f.apply(trash(later))

	pages, err := f.db.ListTrash(ctx, f.user)
	if err != nil {
		t.Fatal(err)
	}
	var ids []uuid.UUID
	for _, p := range pages {
		ids = append(ids, p.ID)
	}
	// Most recent first, and Deep (inside Child) is not listed on its own.
	wantIDs(t, "trash", ids, later, child)

	var nf *pkg.NotFoundError
	if err := f.db.DeleteFromTrash(ctx, f.user, deep); !errors.As(err, &nf) {
		t.Errorf("deleting a page inside a trashed page: err = %v, want not found", err)
	}
	if err := f.db.DeleteFromTrash(ctx, f.user, uuid.New()); !errors.As(err, &nf) {
		t.Errorf("deleting an unknown page: err = %v, want not found", err)
	}
	if err := f.db.DeleteFromTrash(ctx, f.user, child); err != nil {
		t.Fatal(err)
	}
	for _, id := range []uuid.UUID{child, inside, deep} {
		if _, ok := f.db.Items[id]; ok {
			t.Errorf("%s survived deleting the page that held it", id)
		}
	}
	if pages, _ := f.db.ListTrash(ctx, f.user); len(pages) != 1 {
		t.Errorf("trash = %d pages, want 1", len(pages))
	}
}

func TestEmptyTrash(t *testing.T) {
	f := newFixture(t)
	_, _, child, _, _ := f.trashedChild()
	recent := uuid.New()
	f.apply(createPage(recent, f.ws, nil, "Recent"), trash(recent))
	// Child was trashed long ago.
	old := f.item(child)
	old.TrashedAt = ptr(time.Now().Add(-40 * 24 * time.Hour))
	f.db.Items[child] = old

	before := time.Now().Add(-30 * 24 * time.Hour)
	n, err := f.db.EmptyTrash(ctx, f.user, &before)
	if err != nil || n != 1 {
		t.Fatalf("purge removed %d (%v), want 1", n, err)
	}
	if _, ok := f.db.Items[child]; ok {
		t.Error("the expired page is still there")
	}
	if _, ok := f.db.Items[recent]; !ok {
		t.Error("the recent page was removed")
	}

	n, err = f.db.EmptyTrash(ctx, f.user, nil)
	if err != nil || n != 1 {
		t.Fatalf("empty removed %d (%v), want 1", n, err)
	}
	if pages, _ := f.db.ListTrash(ctx, f.user); len(pages) != 0 {
		t.Errorf("trash = %+v, want empty", pages)
	}
	// Other pages are untouched.
	if pages, _ := f.db.ListPages(ctx, f.user); len(pages) != 1 {
		t.Errorf("sidebar = %d pages, want only Page", len(pages))
	}
}
