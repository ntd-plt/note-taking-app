package services_test

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func trashOp(id uuid.UUID) map[string]any { return map[string]any{"op": "trash", "id": id} }

func applyOK(t *testing.T, tr *tree, ops ...map[string]any) {
	t.Helper()
	w := doJSON(t, newItemsRouter(tr.db, &tr.userID), http.MethodPost, "/api/v1/ops", map[string]any{"ops": ops})
	wantStatus(t, w, http.StatusNoContent)
}

// age makes a trashed page look trashed `ago` in the past.
func age(tr *tree, id uuid.UUID, ago time.Duration) {
	it := tr.db.Items[id]
	at := time.Now().Add(-ago)
	it.TrashedAt = &at
	tr.db.Items[id] = it
}

func TestTrashListRestoreAndDelete(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	r := newItemsRouter(db, &tr.userID)
	a := tr.page(tr.root, "A")
	inA := tr.page(a, "Inside A")
	b := tr.page(tr.root, "B")
	applyOK(t, tr, trashOp(a))
	applyOK(t, tr, trashOp(b))

	w := doJSON(t, r, http.MethodGet, "/api/v1/trash", nil)
	wantStatus(t, w, http.StatusOK)
	got := decode[services.TrashResponse](t, w)
	if len(got.Pages) != 2 || got.Pages[0].ID != b || got.Pages[1].ID != a {
		t.Fatalf("trash = %+v, want B then A (Inside A not listed)", got.Pages)
	}
	purge, err := time.Parse(time.RFC3339, got.Pages[0].PurgeAt)
	if err != nil || purge.Sub(*got.Pages[0].TrashedAt) < 29*24*time.Hour {
		t.Errorf("purge_at = %q, want about 30 days after trashed_at", got.Pages[0].PurgeAt)
	}

	// A page inside a trashed page can be neither restored nor deleted alone.
	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/trash/"+inA.String()+"/restore", nil), http.StatusConflict)
	wantStatus(t, doJSON(t, r, http.MethodDelete, "/api/v1/trash/"+inA.String(), nil), http.StatusNotFound)

	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/trash/"+a.String()+"/restore", nil), http.StatusNoContent)
	pages := decode[[]model.Item](t, doJSON(t, r, http.MethodGet, "/api/v1/pages", nil))
	if names := pageNames(pages); len(names) != 2 || names[0] != "A" || names[1] != "Inside A" {
		t.Errorf("sidebar after restore = %v", names)
	}

	wantStatus(t, doJSON(t, r, http.MethodDelete, "/api/v1/trash/"+b.String(), nil), http.StatusNoContent)
	if _, ok := db.Items[b]; ok {
		t.Error("B was not deleted")
	}
	wantStatus(t, doJSON(t, r, http.MethodDelete, "/api/v1/trash/"+b.String(), nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodDelete, "/api/v1/trash/"+a.String(), nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/trash/nope/restore", nil), http.StatusBadRequest)
}

func TestEmptyTrashEndpoint(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	r := newItemsRouter(db, &tr.userID)
	keep := tr.page(tr.root, "Keep")
	for _, name := range []string{"X", "Y"} {
		applyOK(t, tr, trashOp(tr.page(tr.root, name)))
	}
	w := doJSON(t, r, http.MethodDelete, "/api/v1/trash", nil)
	wantStatus(t, w, http.StatusOK)
	if got := decode[map[string]int](t, w); got["deleted"] != 2 {
		t.Errorf("body = %v, want deleted 2", got)
	}
	if _, ok := db.Items[keep]; !ok {
		t.Error("emptying the trash removed a page that was not in it")
	}
	if got := decode[services.TrashResponse](t, doJSON(t, r, http.MethodGet, "/api/v1/trash", nil)); len(got.Pages) != 0 {
		t.Errorf("trash = %+v, want empty", got.Pages)
	}
}

func TestExpiredPagesAreHiddenAndPurgedOnTheNextTrash(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	r := newItemsRouter(db, &tr.userID)
	old := tr.page(tr.root, "Old")
	inOld := tr.block(old, model.ItemTypeParagraph, "inside")
	applyOK(t, tr, trashOp(old))
	age(tr, old, 31*24*time.Hour)

	// Past the retention period: no longer listed, but still stored.
	got := decode[services.TrashResponse](t, doJSON(t, r, http.MethodGet, "/api/v1/trash", nil))
	if len(got.Pages) != 0 {
		t.Errorf("trash = %+v, want the expired page left out", got.Pages)
	}
	if _, ok := db.Items[old]; !ok {
		t.Fatal("the expired page was removed before anything was trashed")
	}

	// A batch without trash leaves it alone; the next trash removes it.
	other := tr.page(tr.root, "Other")
	applyOK(t, tr, map[string]any{"op": "update", "id": other, "props": map[string]any{"name": "Renamed"}})
	if _, ok := db.Items[old]; !ok {
		t.Fatal("a batch without trash purged the trash")
	}
	applyOK(t, tr, trashOp(other))
	for _, id := range []uuid.UUID{old, inOld} {
		if _, ok := db.Items[id]; ok {
			t.Errorf("%s was not purged", id)
		}
	}
	if _, ok := db.Items[other]; !ok {
		t.Error("the page just trashed was purged")
	}

	// A failing purge does not fail the batch.
	db.Errs["EmptyTrash"] = errors.New("boom")
	applyOK(t, tr, map[string]any{"op": "restore", "id": other})
}

func TestRestoreOpValidation(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	r := newItemsRouter(db, &tr.userID)
	p := tr.page(tr.root, "P")
	applyOK(t, tr, trashOp(p))
	w := doJSON(t, r, http.MethodPost, "/api/v1/ops", map[string]any{"ops": []any{
		map[string]any{"op": "restore", "id": p, "props": map[string]any{"name": "x"}},
	}})
	wantStatus(t, w, http.StatusBadRequest)
}

func TestTrashEndpointsNeedAUserAndReportErrors(t *testing.T) {
	db := testutil.NewFakeDatabase()
	tr := newTree(t, db)
	anon := newItemsRouter(db, nil)
	id := uuid.New().String()
	for _, req := range [][2]string{{http.MethodGet, "/api/v1/trash"}, {http.MethodDelete, "/api/v1/trash"},
		{http.MethodPost, "/api/v1/trash/" + id + "/restore"}, {http.MethodDelete, "/api/v1/trash/" + id}} {
		wantStatus(t, doJSON(t, anon, req[0], req[1], nil), http.StatusUnauthorized)
	}
	r := newItemsRouter(db, &tr.userID)
	db.Errs["ListTrash"] = errors.New("boom")
	wantStatus(t, doJSON(t, r, http.MethodGet, "/api/v1/trash", nil), http.StatusInternalServerError)
	db.Errs["EmptyTrash"] = errors.New("boom")
	wantStatus(t, doJSON(t, r, http.MethodDelete, "/api/v1/trash", nil), http.StatusInternalServerError)
}
