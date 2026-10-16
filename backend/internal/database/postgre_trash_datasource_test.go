package database_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type trashEnv struct {
	pool   *pgxpool.Pool
	items  *database.PostgreItemsDataSource
	trash  *database.PostgreTrashDataSource
	me     uuid.UUID
	other  uuid.UUID
	cutoff time.Time
}

func newTrashEnv(t *testing.T) *trashEnv {
	t.Helper()
	items, pool := newItemsDB(t)
	return &trashEnv{
		pool:   pool,
		items:  items,
		trash:  database.NewPostgreTrashDataSource(pool),
		me:     newUser(t, pool),
		other:  newUser(t, pool),
		cutoff: time.Now().Add(-time.Hour),
	}
}

func (e *trashEnv) trashIDs(t *testing.T, ids ...uuid.UUID) []model.TrashItem {
	t.Helper()
	rows, err := e.trash.TrashItems(e.me, ids, time.Now())
	if err != nil {
		t.Fatalf("TrashItems: %v", err)
	}
	return rows
}

func (e *trashEnv) restoreIDs(t *testing.T, ids ...uuid.UUID) []model.Item {
	t.Helper()
	got, err := e.trash.RestoreItems(e.me, ids, e.cutoff)
	if err != nil {
		t.Fatalf("RestoreItems: %v", err)
	}
	return got
}

func (e *trashEnv) trashedIDs(t *testing.T) map[uuid.UUID]bool {
	t.Helper()
	rows, err := e.trash.ListTrash(e.me, e.cutoff)
	if err != nil {
		t.Fatal(err)
	}
	ids := map[uuid.UUID]bool{}
	for _, r := range rows {
		ids[r.ID] = true
	}
	return ids
}

func (e *trashEnv) isLive(userID, id uuid.UUID) bool {
	_, err := e.items.GetItem(userID, id)
	return err == nil
}

func TestTrashMovesSubtreeOutOfTheTree(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", &folder.ID)
	keep := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Keep", nil)
	if _, err := e.items.UpdateItem(e.me, note.ID, model.ItemPatch{IsFavorite: ptr(true)}); err != nil {
		t.Fatal(err)
	}

	rows := e.trashIDs(t, folder.ID)
	if len(rows) != 2 {
		t.Fatalf("trashed %d rows, want the folder and its note", len(rows))
	}
	if rows[0].BatchID != rows[1].BatchID {
		t.Error("rows trashed together must share a batch")
	}

	if e.isLive(e.me, folder.ID) || e.isLive(e.me, note.ID) {
		t.Error("trashed items are still in the tree")
	}
	if _, err := e.items.GetNoteContent(e.me, note.ID); !isNotFound(err) {
		t.Errorf("GetNoteContent on a trashed note err = %v, want not found", err)
	}
	if _, err := e.items.PutNoteContent(e.me, note.ID, "x"); !isNotFound(err) {
		t.Errorf("PutNoteContent on a trashed note err = %v, want not found", err)
	}
	if _, err := e.items.UpdateItem(e.me, note.ID, model.ItemPatch{Name: ptr("x")}); !isNotFound(err) {
		t.Errorf("UpdateItem on a trashed note err = %v, want not found", err)
	}
	live, err := e.items.ListItems(e.me, model.ItemFilter{})
	if err != nil || len(live) != 1 || live[0].ID != keep.ID {
		t.Errorf("live items = %+v, %v; want only the untouched note", live, err)
	}
	if got := e.trashedIDs(t); !got[folder.ID] || !got[note.ID] || len(got) != 2 {
		t.Errorf("trash = %v", got)
	}
}

func TestTrashRestoresSubtreeWithContentAndNoFavorite(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", &folder.ID)
	if _, err := e.items.PutNoteContent(e.me, note.ID, "hello"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.items.UpdateItem(e.me, note.ID, model.ItemPatch{IsFavorite: ptr(true)}); err != nil {
		t.Fatal(err)
	}
	e.trashIDs(t, folder.ID)

	restored := e.restoreIDs(t, folder.ID)
	if len(restored) != 2 || restored[0].ID != folder.ID {
		t.Fatalf("restored = %+v, want the folder first, then its note", restored)
	}
	got, err := e.items.GetItem(e.me, note.ID)
	if err != nil || got.ParentID == nil || *got.ParentID != folder.ID {
		t.Fatalf("restored note = %+v, %v; want it back in its folder", got, err)
	}
	if got.IsFavorite {
		t.Error("a restored item must not be a favorite")
	}
	if !got.CreatedAt.Equal(note.CreatedAt) {
		t.Error("restore must keep created_at")
	}
	if c, err := e.items.GetNoteContent(e.me, note.ID); err != nil || c.Content != "hello" {
		t.Errorf("restored content = %+v, %v", c, err)
	}
	if len(e.trashedIDs(t)) != 0 {
		t.Error("restored items are still listed in the trash")
	}
}

func TestTrashRestoreWithoutLiveParentGoesToTopLevel(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", &folder.ID)
	e.trashIDs(t, folder.ID)

	// The note is restored on its own while its folder is still trashed.
	if got := e.restoreIDs(t, note.ID); len(got) != 1 || got[0].ParentID != nil {
		t.Fatalf("restored = %+v, want one note at the top level", got)
	}
	if !e.trashedIDs(t)[folder.ID] {
		t.Error("the folder should still be in the trash")
	}

	// A parent that was deleted for good behaves the same.
	other := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Other", nil)
	child := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Child", &other.ID)
	e.trashIDs(t, child.ID)
	if err := e.items.DeleteItem(e.me, other.ID); err != nil {
		t.Fatal(err)
	}
	if got := e.restoreIDs(t, child.ID); got[0].ParentID != nil {
		t.Errorf("parent after its folder was deleted = %v, want top level", got[0].ParentID)
	}
}

func TestTrashRestoreKeepsLiveParent(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", &folder.ID)
	e.trashIDs(t, note.ID)
	if got := e.restoreIDs(t, note.ID); got[0].ParentID == nil || *got[0].ParentID != folder.ID {
		t.Errorf("parent = %v, want the live folder", got[0].ParentID)
	}
}

func TestTrashRestoreOnlyTakesTheSameBatch(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	early := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Early", &folder.ID)
	late := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Late", &folder.ID)

	e.trashIDs(t, early.ID)
	e.trashIDs(t, folder.ID)

	restored := e.restoreIDs(t, folder.ID)
	ids := map[uuid.UUID]bool{}
	for _, it := range restored {
		ids[it.ID] = true
	}
	if !ids[folder.ID] || !ids[late.ID] || ids[early.ID] {
		t.Fatalf("restored %v; want the folder and Late, not Early", ids)
	}
	if !e.trashedIDs(t)[early.ID] {
		t.Error("Early, trashed in an earlier batch, should still be in the trash")
	}
	if got := e.restoreIDs(t, early.ID); got[0].ParentID == nil || *got[0].ParentID != folder.ID {
		t.Errorf("Early's parent = %v, want the restored folder", got[0].ParentID)
	}
}

func TestTrashRejectsUnknownAndForeignItems(t *testing.T) {
	e := newTrashEnv(t)
	mine := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Mine", nil)
	theirs := mustCreate(t, e.items, e.other, model.ItemTypeNote, "Theirs", nil)

	for name, ids := range map[string][]uuid.UUID{
		"another user's item": {mine.ID, theirs.ID},
		"a missing item":      {mine.ID, uuid.New()},
		"only unknown items":  {uuid.New()},
	} {
		if _, err := e.trash.TrashItems(e.me, ids, time.Now()); !isNotFound(err) {
			t.Errorf("trashing %s: err = %v, want not found", name, err)
		}
	}
	if !e.isLive(e.me, mine.ID) || !e.isLive(e.other, theirs.ID) {
		t.Error("a rejected request must leave every item where it was")
	}

	e.trashIDs(t, mine.ID)
	if _, err := e.trash.RestoreItems(e.other, []uuid.UUID{mine.ID}, e.cutoff); !isNotFound(err) {
		t.Errorf("restoring another user's item err = %v, want not found", err)
	}
	if err := e.trash.DeleteTrashed(e.other, mine.ID, e.cutoff); !isNotFound(err) {
		t.Errorf("deleting another user's trashed item err = %v, want not found", err)
	}
	if rows, _ := e.trash.ListTrash(e.other, e.cutoff); len(rows) != 0 {
		t.Errorf("another user's trash = %+v, want empty", rows)
	}
	if _, err := e.trash.TrashItems(e.me, []uuid.UUID{mine.ID}, time.Now()); !isNotFound(err) {
		t.Errorf("trashing an already trashed item err = %v, want not found", err)
	}
}

func TestTrashExpiredRowsAreInvisible(t *testing.T) {
	e := newTrashEnv(t)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Old", nil)
	if _, err := e.trash.TrashItems(e.me, []uuid.UUID{note.ID}, time.Now().Add(-2*time.Hour)); err != nil {
		t.Fatal(err)
	}

	if rows, _ := e.trash.ListTrash(e.me, e.cutoff); len(rows) != 0 {
		t.Errorf("expired rows listed: %+v", rows)
	}
	if _, err := e.trash.RestoreItems(e.me, []uuid.UUID{note.ID}, e.cutoff); !isNotFound(err) {
		t.Errorf("restoring an expired item err = %v, want not found", err)
	}
	if err := e.trash.DeleteTrashed(e.me, note.ID, e.cutoff); !isNotFound(err) {
		t.Errorf("deleting an expired item err = %v, want not found", err)
	}

	n, err := e.trash.PurgeExpired(e.cutoff)
	if err != nil || n != 1 {
		t.Errorf("PurgeExpired = %d, %v; want 1", n, err)
	}
	if n, _ := e.trash.PurgeExpired(e.cutoff); n != 0 {
		t.Errorf("a second purge removed %d rows, want 0", n)
	}
}

func TestTrashPurgeKeepsFreshRowsAndEachRowExpiresOnItsOwn(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	child := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Child", &folder.ID)
	e.trashIDs(t, child.ID)
	if _, err := e.trash.TrashItems(e.me, []uuid.UUID{folder.ID}, time.Now().Add(-2*time.Hour)); err != nil {
		t.Fatal(err)
	}

	if n, err := e.trash.PurgeExpired(e.cutoff); err != nil || n != 1 {
		t.Fatalf("PurgeExpired = %d, %v; want only the old folder", n, err)
	}
	if got := e.restoreIDs(t, child.ID); got[0].ParentID != nil {
		t.Errorf("child of a purged folder has parent %v, want top level", got[0].ParentID)
	}
}

func TestTrashDeleteTrashedTakesTrashedDescendants(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", &folder.ID)
	sibling := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Sibling", nil)
	e.trashIDs(t, folder.ID, sibling.ID)

	if err := e.trash.DeleteTrashed(e.me, folder.ID, e.cutoff); err != nil {
		t.Fatal(err)
	}
	got := e.trashedIDs(t)
	if got[folder.ID] || got[note.ID] || !got[sibling.ID] {
		t.Errorf("trash after deleting the folder = %v, want only the sibling", got)
	}
	if err := e.trash.DeleteTrashed(e.me, folder.ID, e.cutoff); !isNotFound(err) {
		t.Errorf("deleting twice err = %v, want not found", err)
	}
}

func TestTrashEmptyTrashIsScopedToTheUser(t *testing.T) {
	e := newTrashEnv(t)
	mine := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Mine", nil)
	theirs := mustCreate(t, e.items, e.other, model.ItemTypeNote, "Theirs", nil)
	e.trashIDs(t, mine.ID)
	if _, err := e.trash.TrashItems(e.other, []uuid.UUID{theirs.ID}, time.Now()); err != nil {
		t.Fatal(err)
	}

	if err := e.trash.EmptyTrash(e.me); err != nil {
		t.Fatal(err)
	}
	if len(e.trashedIDs(t)) != 0 {
		t.Error("my trash is not empty")
	}
	if rows, _ := e.trash.ListTrash(e.other, e.cutoff); len(rows) != 1 {
		t.Errorf("the other user's trash = %+v, want it untouched", rows)
	}
}

func TestTrashedIDCannotBeReused(t *testing.T) {
	e := newTrashEnv(t)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", nil)
	e.trashIDs(t, note.ID)

	_, err := e.items.CreateItem(model.Item{ID: note.ID, UserID: e.me, Type: model.ItemTypeNote, Name: "Again", Icon: "x"}, "")
	var exists *pkg.AlreadyExistsError
	if !errors.As(err, &exists) {
		t.Errorf("creating an item with a trashed id err = %v, want already exists", err)
	}
}

func TestTrashCannotMoveOrCreateIntoATrashedFolder(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Folder", nil)
	note := mustCreate(t, e.items, e.me, model.ItemTypeNote, "Note", nil)
	e.trashIDs(t, folder.ID)

	if _, err := e.items.CreateItem(model.Item{UserID: e.me, ParentID: &folder.ID, Type: model.ItemTypeNote, Name: "X", Icon: "x"}, ""); !errors.Is(err, database.ErrInvalidParent) {
		t.Errorf("creating inside a trashed folder err = %v, want ErrInvalidParent", err)
	}
	if _, err := e.items.MoveItems(e.me, []model.ItemMove{{ID: note.ID, ParentID: &folder.ID}}); !errors.Is(err, database.ErrInvalidParent) {
		t.Errorf("moving into a trashed folder err = %v, want ErrInvalidParent", err)
	}
}

func TestTrashTooLarge(t *testing.T) {
	e := newTrashEnv(t)
	folder := mustCreate(t, e.items, e.me, model.ItemTypeFolder, "Big", nil)
	// Fill the folder through SQL: creating a thousand items one by one is slow.
	if _, err := e.pool.Exec(context.Background(), `
		INSERT INTO items (id, user_id, parent_id, type, name, icon)
		SELECT gen_random_uuid(), $1, $2, 'folder', 'f' || n, 'x' FROM generate_series(1, $3) AS n`,
		e.me, folder.ID, database.MaxTrashRows); err != nil {
		t.Fatal(err)
	}

	if _, err := e.trash.TrashItems(e.me, []uuid.UUID{folder.ID}, time.Now()); !errors.Is(err, database.ErrTrashTooLarge) {
		t.Fatalf("err = %v, want ErrTrashTooLarge", err)
	}
	if !e.isLive(e.me, folder.ID) {
		t.Error("a rejected trash must leave the folder in the tree")
	}
}
