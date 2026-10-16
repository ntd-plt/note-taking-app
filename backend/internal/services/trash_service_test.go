package services_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const testRetention = 24 * time.Hour

type clock struct{ now time.Time }

func (c *clock) Now() time.Time { return c.now }

func newTrashRouter(db *testutil.FakeDatabase, userID *uuid.UUID, c *clock) *gin.Engine {
	gin.SetMode(gin.TestMode)
	items := services.NewItemsService(db)
	trash := services.NewTrashServiceWithClock(db, testRetention, c.Now)

	r := gin.New()
	r.Use(func(ctx *gin.Context) {
		if userID != nil {
			ctx.Set("userID", *userID)
		}
	})
	r.POST("/api/v1/items", items.CreateItem)
	r.GET("/api/v1/items", items.ListItems)
	r.PATCH("/api/v1/items", items.MoveItems)
	r.GET("/api/v1/items/:id", items.GetItem)
	r.PATCH("/api/v1/items/:id", items.UpdateItem)
	r.DELETE("/api/v1/items/:id", items.DeleteItem)
	r.GET("/api/v1/items/:id/content", items.GetNoteContent)
	r.PUT("/api/v1/items/:id/content", items.PutNoteContent)
	r.POST("/api/v1/items/trash", trash.TrashItems)
	r.POST("/api/v1/items/restore", trash.RestoreItems)
	r.GET("/api/v1/trash", trash.ListTrash)
	r.DELETE("/api/v1/trash", trash.EmptyTrash)
	r.DELETE("/api/v1/trash/:id", trash.DeleteTrashed)
	return r
}

func idsBody(ids ...uuid.UUID) string {
	quoted := make([]string, len(ids))
	for i, id := range ids {
		quoted[i] = `"` + id.String() + `"`
	}
	return `{"ids":[` + strings.Join(quoted, ",") + `]}`
}

func decodeTrash(t *testing.T, w *httptest.ResponseRecorder) []model.TrashItem {
	t.Helper()
	var items []model.TrashItem
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatalf("decoding trash %q: %v", w.Body.String(), err)
	}
	return items
}

type trashFixture struct {
	db     *testutil.FakeDatabase
	user   uuid.UUID
	clock  *clock
	router *gin.Engine
}

func newTrashFixture() *trashFixture {
	db := testutil.NewFakeDatabase()
	user := uuid.New()
	c := &clock{now: time.Date(2026, 6, 1, 12, 0, 0, 0, time.UTC)}
	return &trashFixture{db: db, user: user, clock: c, router: newTrashRouter(db, &user, c)}
}

func (f *trashFixture) trash(t *testing.T, ids ...uuid.UUID) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, f.router, http.MethodPost, "/api/v1/items/trash", idsBody(ids...))
}

func (f *trashFixture) restore(t *testing.T, ids ...uuid.UUID) *httptest.ResponseRecorder {
	t.Helper()
	return doJSON(t, f.router, http.MethodPost, "/api/v1/items/restore", idsBody(ids...))
}

func (f *trashFixture) list(t *testing.T) []model.TrashItem {
	t.Helper()
	w := doJSON(t, f.router, http.MethodGet, "/api/v1/trash", "")
	wantStatus(t, w, http.StatusOK)
	return decodeTrash(t, w)
}

func TestTrashItemsHidesThemEverywhere(t *testing.T) {
	f := newTrashFixture()
	folder := addFolder(f.db, f.user, "Folder", nil)
	note := addNote(f.db, f.user, "Note", &folder.ID)
	other := addFolder(f.db, f.user, "Other", nil)
	favorite := f.db.Items[note.ID]
	favorite.IsFavorite = true
	f.db.Items[note.ID] = favorite

	w := f.trash(t, folder.ID)
	wantStatus(t, w, http.StatusOK)
	if got := decodeTrash(t, w); len(got) != 2 {
		t.Fatalf("trashed %d rows, want the folder and its note", len(got))
	}
	for _, row := range f.db.Trash {
		if !row.DeletedAt.Equal(f.clock.now) {
			t.Errorf("deleted_at = %v, want the request time", row.DeletedAt)
		}
	}

	for _, id := range []uuid.UUID{folder.ID, note.ID} {
		wantStatus(t, doJSON(t, f.router, http.MethodGet, itemPath(id), ""), http.StatusNotFound)
		wantStatus(t, doJSON(t, f.router, http.MethodPatch, itemPath(id), `{"name":"x"}`), http.StatusNotFound)
		wantStatus(t, doJSON(t, f.router, http.MethodPatch, itemPath(id), `{"is_favorite":true}`), http.StatusNotFound)
		wantStatus(t, doJSON(t, f.router, http.MethodDelete, itemPath(id), ""), http.StatusNotFound)
	}
	wantStatus(t, doJSON(t, f.router, http.MethodGet, itemPath(note.ID)+"/content", ""), http.StatusNotFound)
	wantStatus(t, doJSON(t, f.router, http.MethodPut, itemPath(note.ID)+"/content", `{"content":"x"}`), http.StatusNotFound)

	live := decodeItems(t, doJSON(t, f.router, http.MethodGet, "/api/v1/items", ""))
	if !equalStrings(names(live), []string{"Other"}) {
		t.Errorf("live items = %v, want only Other", names(live))
	}

	moveBody := fmt.Sprintf(`{"items":[{"id":%q,"parent_id":%q}]}`, other.ID, folder.ID)
	wantStatus(t, doJSON(t, f.router, http.MethodPatch, "/api/v1/items", moveBody), http.StatusNotFound)
	createBody := fmt.Sprintf(`{"type":"note","name":"X","parent_id":%q}`, folder.ID)
	wantStatus(t, doJSON(t, f.router, http.MethodPost, "/api/v1/items", createBody), http.StatusNotFound)
	wantStatus(t, doJSON(t, f.router, http.MethodPost, "/api/v1/items?cloneFromId="+folder.ID.String(), ""), http.StatusNotFound)
}

func TestTrashedItemIDCannotBeReused(t *testing.T) {
	f := newTrashFixture()
	note := addNote(f.db, f.user, "Note", nil)
	wantStatus(t, f.trash(t, note.ID), http.StatusOK)

	body := fmt.Sprintf(`{"id":%q,"type":"note","name":"Again"}`, note.ID)
	wantStatus(t, doJSON(t, f.router, http.MethodPost, "/api/v1/items", body), http.StatusConflict)
}

func TestTrashItemsValidation(t *testing.T) {
	f := newTrashFixture()
	note := addNote(f.db, f.user, "Note", nil)
	otherUser := uuid.New()
	theirs := addNote(f.db, otherUser, "Theirs", nil)

	tooMany := make([]uuid.UUID, services.MaxTrashIDs+1)
	for i := range tooMany {
		tooMany[i] = uuid.New()
	}

	cases := []struct {
		name string
		body string
		want int
	}{
		{"no ids", `{"ids":[]}`, http.StatusBadRequest},
		{"missing ids", `{}`, http.StatusBadRequest},
		{"not json", `nope`, http.StatusBadRequest},
		{"unknown field", `{"ids":[],"x":1}`, http.StatusBadRequest},
		{"invalid id", `{"ids":["nope"]}`, http.StatusBadRequest},
		{"duplicate id", idsBody(note.ID, note.ID), http.StatusBadRequest},
		{"too many ids", idsBody(tooMany...), http.StatusBadRequest},
		{"unknown item", idsBody(note.ID, uuid.New()), http.StatusNotFound},
		{"another user's item", idsBody(note.ID, theirs.ID), http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			wantStatus(t, doJSON(t, f.router, http.MethodPost, "/api/v1/items/trash", tc.body), tc.want)
			wantStatus(t, doJSON(t, f.router, http.MethodPost, "/api/v1/items/restore", tc.body), tc.want)
		})
	}
	if _, ok := f.db.Items[note.ID]; !ok || len(f.db.Trash) != 0 {
		t.Error("a rejected request must not trash anything")
	}
}

func TestTrashTooLargeIsABadRequest(t *testing.T) {
	f := newTrashFixture()
	folder := addFolder(f.db, f.user, "Big", nil)
	for i := 0; i < database.MaxTrashRows; i++ {
		addNote(f.db, f.user, fmt.Sprintf("n%d", i), &folder.ID)
	}
	wantStatus(t, f.trash(t, folder.ID), http.StatusBadRequest)
	if len(f.db.Trash) != 0 {
		t.Error("a rejected request must not trash anything")
	}
}

func TestListTrashNewestFirstAndOwnOnly(t *testing.T) {
	f := newTrashFixture()
	first := addNote(f.db, f.user, "First", nil)
	second := addNote(f.db, f.user, "Second", nil)
	theirs := addNote(f.db, uuid.New(), "Theirs", nil)

	wantStatus(t, f.trash(t, first.ID), http.StatusOK)
	f.clock.now = f.clock.now.Add(time.Minute)
	wantStatus(t, f.trash(t, second.ID), http.StatusOK)
	f.db.Trash[theirs.ID] = model.TrashItem{ID: theirs.ID, UserID: uuid.New(), DeletedAt: f.clock.now}

	got := f.list(t)
	if len(got) != 2 || got[0].ID != second.ID || got[1].ID != first.ID {
		t.Errorf("trash = %+v, want Second then First", got)
	}
	if got[0].DeletedAt.IsZero() {
		t.Error("deleted_at missing from the listing")
	}

	empty := newTrashFixture()
	w := doJSON(t, empty.router, http.MethodGet, "/api/v1/trash", "")
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("an empty trash = %s, want []", w.Body.String())
	}
}

func TestRestoreItems(t *testing.T) {
	f := newTrashFixture()
	folder := addFolder(f.db, f.user, "Folder", nil)
	note := addNote(f.db, f.user, "Note", &folder.ID)
	wantStatus(t, f.trash(t, folder.ID), http.StatusOK)

	w := f.restore(t, folder.ID)
	wantStatus(t, w, http.StatusOK)
	if got := decodeItems(t, w); len(got) != 2 {
		t.Fatalf("restored %d items, want the folder and its note", len(got))
	}
	back := decodeItem(t, doJSON(t, f.router, http.MethodGet, itemPath(note.ID), ""))
	if back.ParentID == nil || *back.ParentID != folder.ID || back.IsFavorite {
		t.Errorf("restored note = %+v, want it back in the folder and not a favorite", back)
	}
	if got := decodeJSONContent(t, doJSON(t, f.router, http.MethodGet, itemPath(note.ID)+"/content", "")); got != "content of Note" {
		t.Errorf("restored content = %q", got)
	}
	if len(f.list(t)) != 0 {
		t.Error("the trash should be empty after the restore")
	}
	wantStatus(t, f.restore(t, folder.ID), http.StatusNotFound)
}

func decodeJSONContent(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	wantStatus(t, w, http.StatusOK)
	var nc model.NoteContent
	if err := json.Unmarshal(w.Body.Bytes(), &nc); err != nil {
		t.Fatal(err)
	}
	return nc.Content
}

func TestRestoreChildWhileParentIsTrashedGoesToTheTopLevel(t *testing.T) {
	f := newTrashFixture()
	folder := addFolder(f.db, f.user, "Folder", nil)
	note := addNote(f.db, f.user, "Note", &folder.ID)
	wantStatus(t, f.trash(t, folder.ID), http.StatusOK)

	got := decodeItems(t, f.restore(t, note.ID))
	if len(got) != 1 || got[0].ParentID != nil {
		t.Fatalf("restored = %+v, want one top-level note", got)
	}
	if rows := f.list(t); len(rows) != 1 || rows[0].ID != folder.ID {
		t.Errorf("trash = %+v, want only the folder", rows)
	}
}

func TestRestoreLeavesSeparatelyTrashedDescendantsInTheTrash(t *testing.T) {
	f := newTrashFixture()
	folder := addFolder(f.db, f.user, "Folder", nil)
	early := addNote(f.db, f.user, "Early", &folder.ID)
	late := addNote(f.db, f.user, "Late", &folder.ID)
	wantStatus(t, f.trash(t, early.ID), http.StatusOK)
	wantStatus(t, f.trash(t, folder.ID), http.StatusOK)

	got := decodeItems(t, f.restore(t, folder.ID))
	if !equalStrings(names(got), []string{"Folder", "Late"}) {
		t.Errorf("restored %v, want Folder and Late", names(got))
	}
	if rows := f.list(t); len(rows) != 1 || rows[0].ID != early.ID {
		t.Errorf("trash = %+v, want only Early", rows)
	}
	_ = late
}

func TestExpiredTrashIsGone(t *testing.T) {
	f := newTrashFixture()
	note := addNote(f.db, f.user, "Note", nil)
	wantStatus(t, f.trash(t, note.ID), http.StatusOK)

	f.clock.now = f.clock.now.Add(testRetention - time.Second)
	if len(f.list(t)) != 1 {
		t.Fatal("an item inside the retention period must be listed")
	}

	f.clock.now = f.clock.now.Add(2 * time.Second)
	if len(f.list(t)) != 0 {
		t.Error("an expired item is still listed")
	}
	wantStatus(t, f.restore(t, note.ID), http.StatusNotFound)
	wantStatus(t, doJSON(t, f.router, http.MethodDelete, "/api/v1/trash/"+note.ID.String(), ""), http.StatusNotFound)
}

func TestDeleteTrashedItem(t *testing.T) {
	f := newTrashFixture()
	folder := addFolder(f.db, f.user, "Folder", nil)
	addNote(f.db, f.user, "Note", &folder.ID)
	keep := addNote(f.db, f.user, "Keep", nil)
	live := addNote(f.db, f.user, "Live", nil)
	wantStatus(t, f.trash(t, folder.ID, keep.ID), http.StatusOK)

	wantStatus(t, doJSON(t, f.router, http.MethodDelete, "/api/v1/trash/"+folder.ID.String(), ""), http.StatusNoContent)
	if rows := f.list(t); len(rows) != 1 || rows[0].ID != keep.ID {
		t.Errorf("trash = %+v, want only Keep", rows)
	}
	wantStatus(t, doJSON(t, f.router, http.MethodDelete, "/api/v1/trash/"+folder.ID.String(), ""), http.StatusNotFound)
	wantStatus(t, doJSON(t, f.router, http.MethodDelete, "/api/v1/trash/"+live.ID.String(), ""), http.StatusNotFound)
	wantStatus(t, doJSON(t, f.router, http.MethodDelete, "/api/v1/trash/nope", ""), http.StatusBadRequest)
	if _, ok := f.db.Items[live.ID]; !ok {
		t.Error("DELETE /trash/:id must not touch live items")
	}
}

func TestEmptyTrash(t *testing.T) {
	f := newTrashFixture()
	a := addNote(f.db, f.user, "A", nil)
	b := addFolder(f.db, f.user, "B", nil)
	live := addNote(f.db, f.user, "Live", nil)
	theirs := model.TrashItem{ID: uuid.New(), UserID: uuid.New(), DeletedAt: f.clock.now}
	f.db.Trash[theirs.ID] = theirs
	wantStatus(t, f.trash(t, a.ID, b.ID), http.StatusOK)

	wantStatus(t, doJSON(t, f.router, http.MethodDelete, "/api/v1/trash", ""), http.StatusNoContent)
	if len(f.list(t)) != 0 {
		t.Error("the trash is not empty")
	}
	if _, ok := f.db.Trash[theirs.ID]; !ok {
		t.Error("emptying my trash removed another user's items")
	}
	if _, ok := f.db.Items[live.ID]; !ok {
		t.Error("emptying the trash removed a live item")
	}
}

func TestTrashRoutesRequireAuthentication(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newTrashRouter(db, nil, &clock{now: time.Now()})
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPost, "/api/v1/items/trash", idsBody(uuid.New())},
		{http.MethodPost, "/api/v1/items/restore", idsBody(uuid.New())},
		{http.MethodGet, "/api/v1/trash", ""},
		{http.MethodDelete, "/api/v1/trash", ""},
		{http.MethodDelete, "/api/v1/trash/" + uuid.NewString(), ""},
	} {
		wantStatus(t, doJSON(t, r, tc.method, tc.path, tc.body), http.StatusUnauthorized)
	}
}

func TestTrashInternalErrorsAreNotLeaked(t *testing.T) {
	f := newTrashFixture()
	note := addNote(f.db, f.user, "Note", nil)
	f.db.Errs["TrashItems"] = fmt.Errorf("pq: secret detail")
	w := f.trash(t, note.ID)
	wantStatus(t, w, http.StatusInternalServerError)
	if strings.Contains(w.Body.String(), "secret") {
		t.Errorf("response leaks the internal error: %s", w.Body.String())
	}
}

func TestPurgeExpiredUsesTheRetentionPeriod(t *testing.T) {
	f := newTrashFixture()
	old := addNote(f.db, f.user, "Old", nil)
	fresh := addNote(f.db, f.user, "Fresh", nil)
	wantStatus(t, f.trash(t, old.ID), http.StatusOK)
	f.clock.now = f.clock.now.Add(testRetention / 2)
	wantStatus(t, f.trash(t, fresh.ID), http.StatusOK)
	f.clock.now = f.clock.now.Add(testRetention/2 + time.Second)

	svc := services.NewTrashServiceWithClock(f.db, testRetention, f.clock.Now)
	n, err := svc.PurgeExpired()
	if err != nil || n != 1 {
		t.Fatalf("PurgeExpired = %d, %v; want 1", n, err)
	}
	if _, ok := f.db.Trash[old.ID]; ok {
		t.Error("the expired item survived the purge")
	}
	if _, ok := f.db.Trash[fresh.ID]; !ok {
		t.Error("the purge removed an item still inside the retention period")
	}
}

// purgeSpy reports each purge, so the test can wait for one without racing the
// purger goroutine on the fake's maps.
type purgeSpy struct {
	*testutil.FakeDatabase
	purged chan int64
}

func (p *purgeSpy) PurgeExpired(cutoff time.Time) (int64, error) {
	n, err := p.FakeDatabase.PurgeExpired(cutoff)
	select {
	case p.purged <- n:
	default:
	}
	return n, err
}

func TestRunPurgerPurgesAtStartAndStopsOnCancel(t *testing.T) {
	db := testutil.NewFakeDatabase()
	id := uuid.New()
	db.Trash[id] = model.TrashItem{ID: id, UserID: uuid.New(), DeletedAt: time.Now().Add(-time.Hour)}
	spy := &purgeSpy{FakeDatabase: db, purged: make(chan int64, 1)}
	svc := services.NewTrashService(spy, time.Minute)

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { svc.RunPurger(ctx); close(done) }()

	select {
	case n := <-spy.purged:
		if n != 1 {
			t.Errorf("the first purge removed %d items, want 1", n)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("the purger did not purge at start")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("the purger did not stop after cancel")
	}
	if _, ok := db.Trash[id]; ok {
		t.Error("the expired item survived")
	}
}
