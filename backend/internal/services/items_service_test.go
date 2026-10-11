package services_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"backend/internal/database"
	"backend/internal/middleware"
	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

func newItemsRouter(db *testutil.FakeDatabase, userID *uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := services.NewItemsService(db)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if userID != nil {
			c.Set("userID", *userID)
		}
	})
	r.POST("/api/v1/items", h.CreateItem)
	r.GET("/api/v1/items", h.ListItems)
	r.PATCH("/api/v1/items", h.MoveItems)
	r.GET("/api/v1/items/:id", h.GetItem)
	r.PATCH("/api/v1/items/:id", h.UpdateItem)
	r.DELETE("/api/v1/items/:id", h.DeleteItem)
	r.GET("/api/v1/items/:id/content", h.GetNoteContent)
	r.PUT("/api/v1/items/:id/content", h.PutNoteContent)
	return r
}

var baseTime = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)

func addItem(db *testutil.FakeDatabase, userID uuid.UUID, typ model.ItemType, name string, parent *uuid.UUID) model.Item {
	baseTime = baseTime.Add(time.Second)
	it := model.Item{
		ID: uuid.New(), UserID: userID, ParentID: parent, Type: typ, Name: name,
		Icon: "📄", CreatedAt: baseTime, UpdatedAt: baseTime,
	}
	db.Items[it.ID] = it
	if typ == model.ItemTypeNote {
		db.Contents[it.ID] = model.NoteContent{ItemID: it.ID, Content: "content of " + name, UpdatedAt: baseTime}
	}
	return it
}

func addFolder(db *testutil.FakeDatabase, userID uuid.UUID, name string, parent *uuid.UUID) model.Item {
	return addItem(db, userID, model.ItemTypeFolder, name, parent)
}

func addNote(db *testutil.FakeDatabase, userID uuid.UUID, name string, parent *uuid.UUID) model.Item {
	return addItem(db, userID, model.ItemTypeNote, name, parent)
}

func decodeItem(t *testing.T, w *httptest.ResponseRecorder) model.Item {
	t.Helper()
	var it model.Item
	if err := json.Unmarshal(w.Body.Bytes(), &it); err != nil {
		t.Fatalf("decoding item %q: %v", w.Body.String(), err)
	}
	return it
}

func decodeItems(t *testing.T, w *httptest.ResponseRecorder) []model.Item {
	t.Helper()
	var items []model.Item
	if err := json.Unmarshal(w.Body.Bytes(), &items); err != nil {
		t.Fatalf("decoding items %q: %v", w.Body.String(), err)
	}
	return items
}

func wantStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, want, w.Body.String())
	}
}

func names(items []model.Item) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = it.Name
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func itemPath(id uuid.UUID) string { return "/api/v1/items/" + id.String() }

func TestCreateNoteSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/v1/items", `{"type":"note","name":"  My note  ","content":"<p>Hello</p>"}`)
	wantStatus(t, w, http.StatusCreated)

	created := decodeItem(t, w)
	if created.Name != "My note" || created.Type != model.ItemTypeNote {
		t.Errorf("created = %+v, want a note named %q", created, "My note")
	}
	if created.UserID != userID {
		t.Errorf("owner = %v, want the authenticated user %v", created.UserID, userID)
	}
	if created.ParentID != nil {
		t.Errorf("parent = %v, want nil for a top-level item", created.ParentID)
	}
	if created.Icon != "📄" {
		t.Errorf("icon = %q, want the note default", created.Icon)
	}
	if got := db.Contents[created.ID].Content; got != "<p>Hello</p>" {
		t.Errorf("stored content = %q, want the request content", got)
	}
}

func TestCreateFolderDefaultsAndNoContent(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/v1/items", `{"type":"folder","name":"Work"}`)
	wantStatus(t, w, http.StatusCreated)

	created := decodeItem(t, w)
	if created.Icon != "📁" {
		t.Errorf("icon = %q, want the folder default", created.Icon)
	}
	if _, ok := db.Contents[created.ID]; ok {
		t.Error("a folder must not get a content row")
	}
}

func TestCreateItemInFolder(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Folder", nil)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/v1/items", map[string]any{
		"type": "note", "name": "Inside", "parent_id": folder.ID,
	})
	wantStatus(t, w, http.StatusCreated)
	if got := decodeItem(t, w).ParentID; got == nil || *got != folder.ID {
		t.Errorf("parent = %v, want %v", got, folder.ID)
	}
}

func TestCreateItemWithClientID(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newItemsRouter(db, &userID)
	id := uuid.New()

	w := doJSON(t, r, http.MethodPost, "/api/v1/items", map[string]any{"id": id, "type": "note", "name": "A"})
	wantStatus(t, w, http.StatusCreated)
	if got := decodeItem(t, w).ID; got != id {
		t.Errorf("id = %v, want the client's %v", got, id)
	}

	w = doJSON(t, r, http.MethodPost, "/api/v1/items", map[string]any{"id": id, "type": "note", "name": "B"})
	wantStatus(t, w, http.StatusConflict)
}

func TestCreateItemParentRules(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	note := addNote(db, userID, "A note", nil)
	foreign := addFolder(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)

	tests := []struct {
		name   string
		parent uuid.UUID
		want   int
	}{
		{"missing parent", uuid.New(), http.StatusNotFound},
		{"another user's folder", foreign.ID, http.StatusNotFound},
		{"a note as parent", note.ID, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := doJSON(t, r, http.MethodPost, "/api/v1/items", map[string]any{
				"type": "note", "name": "X", "parent_id": tt.parent,
			})
			wantStatus(t, w, tt.want)
		})
	}
	if len(db.Items) != 2 {
		t.Errorf("%d items stored, want only the 2 seeded", len(db.Items))
	}
}

func TestCreateItemValidation(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newItemsRouter(db, &userID)

	tests := []struct {
		name string
		body string
	}{
		{"missing type", `{"name":"A"}`},
		{"unknown type", `{"type":"task","name":"A"}`},
		{"missing name", `{"type":"note"}`},
		{"blank name", `{"type":"note","name":"   "}`},
		{"name too long", `{"type":"note","name":"` + strings.Repeat("a", 256) + `"}`},
		{"icon too long", `{"type":"note","name":"A","icon":"` + strings.Repeat("a", 33) + `"}`},
		{"content on a folder", `{"type":"folder","name":"A","content":"x"}`},
		{"unknown field", `{"type":"note","name":"A","user_id":"` + uuid.New().String() + `"}`},
		{"not json", `not json`},
		{"empty body", ``},
		{"trailing data", `{"type":"note","name":"A"} {}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/items", tt.body), http.StatusBadRequest)
		})
	}
	if len(db.Items) != 0 {
		t.Errorf("%d items stored, want none after invalid requests", len(db.Items))
	}
}

func TestCreateItemContentTooLarge(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newItemsRouter(db, &userID)

	body := map[string]any{"type": "note", "name": "Big", "content": strings.Repeat("a", services.MaxContentBytes+1)}
	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/items", body), http.StatusRequestEntityTooLarge)
}

func TestCreateItemTooDeep(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	var parent *uuid.UUID
	for i := 0; i < database.MaxTreeDepth; i++ {
		f := addFolder(db, userID, "level", parent)
		parent = &f.ID
	}
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/v1/items", map[string]any{"type": "note", "name": "Too deep", "parent_id": parent})
	wantStatus(t, w, http.StatusBadRequest)
}

func TestItemsRequireAuthentication(t *testing.T) {
	r := newItemsRouter(testutil.NewFakeDatabase(), nil)
	id := uuid.New()
	tests := []struct{ method, path, body string }{
		{http.MethodPost, "/api/v1/items", `{"type":"note","name":"A"}`},
		{http.MethodPost, "/api/v1/items?cloneFromId=" + id.String(), ""},
		{http.MethodGet, "/api/v1/items", ""},
		{http.MethodPatch, "/api/v1/items", `{"items":[]}`},
		{http.MethodGet, itemPath(id), ""},
		{http.MethodPatch, itemPath(id), `{"name":"x"}`},
		{http.MethodDelete, itemPath(id), ""},
		{http.MethodGet, itemPath(id) + "/content", ""},
		{http.MethodPut, itemPath(id) + "/content", `{"content":""}`},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, tt.method, tt.path, tt.body), http.StatusUnauthorized)
		})
	}
}

func TestInternalErrorsAreNotLeaked(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	db.Errs["ListItems"] = errors.New("pq: password authentication failed for user secret_user")
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/v1/items", nil)
	wantStatus(t, w, http.StatusInternalServerError)
	if strings.Contains(w.Body.String(), "secret_user") {
		t.Errorf("response leaks the internal error: %s", w.Body.String())
	}
}

func TestRequestBodyLimit(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	h := services.NewItemsService(db)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("userID", userID) })
	r.Use(middleware.MaxBodyBytes(64))
	r.POST("/api/v1/items", h.CreateItem)

	body := `{"type":"note","name":"` + strings.Repeat("a", 200) + `"}`
	wantStatus(t, doJSON(t, r, http.MethodPost, "/api/v1/items", body), http.StatusRequestEntityTooLarge)
}

func TestCloneNoteCopiesContentNextToOriginal(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Folder", nil)
	note := addNote(db, userID, "Plan", &folder.ID)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/v1/items?cloneFromId="+note.ID.String(), nil)
	wantStatus(t, w, http.StatusCreated)

	copied := decodeItem(t, w)
	if copied.ID == note.ID {
		t.Fatal("the copy must have a new id")
	}
	if copied.Name != "Plan (Copy 1)" {
		t.Errorf("name = %q, want %q", copied.Name, "Plan (Copy 1)")
	}
	if copied.ParentID == nil || *copied.ParentID != folder.ID {
		t.Errorf("parent = %v, want the original's parent %v", copied.ParentID, folder.ID)
	}
	if got := db.Contents[copied.ID].Content; got != "content of Plan" {
		t.Errorf("copied content = %q, want the original's", got)
	}
	if got := db.Contents[note.ID].Content; got != "content of Plan" {
		t.Errorf("the original changed: %q", got)
	}

	w = doJSON(t, r, http.MethodPost, "/api/v1/items?cloneFromId="+note.ID.String(), nil)
	wantStatus(t, w, http.StatusCreated)
	if got := decodeItem(t, w).Name; got != "Plan (Copy 2)" {
		t.Errorf("second copy name = %q, want %q", got, "Plan (Copy 2)")
	}
}

func TestCloneFolderCopiesSubtree(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	top := addFolder(db, userID, "Top", nil)
	sub := addFolder(db, userID, "Sub", &top.ID)
	addNote(db, userID, "Deep", &sub.ID)
	addNote(db, userID, "Shallow", &top.ID)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/v1/items?cloneFromId="+top.ID.String(), nil)
	wantStatus(t, w, http.StatusCreated)
	root := decodeItem(t, w)
	if root.Name != "Top (Copy 1)" {
		t.Fatalf("root name = %q, want %q", root.Name, "Top (Copy 1)")
	}

	w = doJSON(t, r, http.MethodGet, "/api/v1/items?parent_id="+root.ID.String(), nil)
	wantStatus(t, w, http.StatusOK)
	children := decodeItems(t, w)
	if want := []string{"Sub", "Shallow"}; !equalStrings(names(children), want) {
		t.Fatalf("copied children = %v, want %v (original names, folders first)", names(children), want)
	}

	w = doJSON(t, r, http.MethodGet, "/api/v1/items?parent_id="+children[0].ID.String(), nil)
	if got := names(decodeItems(t, w)); !equalStrings(got, []string{"Deep"}) {
		t.Errorf("copied sub-folder holds %v, want [Deep]", got)
	}
	if len(db.Items) != 8 {
		t.Errorf("%d items stored, want 4 originals + 4 copies", len(db.Items))
	}
}

func TestCloneRejectsBadRequests(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	mine := addNote(db, userID, "Mine", nil)
	theirs := addNote(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)
	before := len(db.Items)

	tests := []struct {
		name string
		url  string
		body string
		want int
	}{
		{"not a uuid", "/api/v1/items?cloneFromId=abc", "", http.StatusBadRequest},
		{"empty id", "/api/v1/items?cloneFromId=", "", http.StatusBadRequest},
		{"body must be empty", "/api/v1/items?cloneFromId=" + mine.ID.String(), `{"type":"note","name":"X"}`, http.StatusBadRequest},
		{"missing source", "/api/v1/items?cloneFromId=" + uuid.New().String(), "", http.StatusNotFound},
		{"another user's source", "/api/v1/items?cloneFromId=" + theirs.ID.String(), "", http.StatusNotFound},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodPost, tt.url, tt.body), tt.want)
		})
	}
	if len(db.Items) != before {
		t.Errorf("%d items stored, want %d: failed clones must create nothing", len(db.Items), before)
	}
}

func TestListItemsSortedAndScopedToUser(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	addNote(db, userID, "b note", nil)
	addFolder(db, userID, "Zeta", nil)
	addNote(db, userID, "A note", nil)
	addFolder(db, userID, "alpha", nil)
	addNote(db, otherID, "not mine", nil)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/v1/items", nil)
	wantStatus(t, w, http.StatusOK)
	if want, got := []string{"alpha", "Zeta", "A note", "b note"}, names(decodeItems(t, w)); !equalStrings(got, want) {
		t.Errorf("order = %v, want %v (folders first, then by name ignoring case)", got, want)
	}
	if strings.Contains(w.Body.String(), "content") {
		t.Errorf("the list must not carry note content: %s", w.Body.String())
	}
}

func TestListItemsEmptyIsAnArray(t *testing.T) {
	userID := uuid.New()
	r := newItemsRouter(testutil.NewFakeDatabase(), &userID)

	w := doJSON(t, r, http.MethodGet, "/api/v1/items", nil)
	wantStatus(t, w, http.StatusOK)
	if strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("body = %s, want []", w.Body.String())
	}
}

func TestListItemsByParent(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	folder := addFolder(db, userID, "Folder", nil)
	addNote(db, userID, "Inside", &folder.ID)
	addNote(db, userID, "Root note", nil)
	note := addNote(db, userID, "A note", nil)
	foreign := addFolder(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)

	tests := []struct {
		name  string
		query string
		want  int
		names []string
	}{
		{"children of a folder", "?parent_id=" + folder.ID.String(), http.StatusOK, []string{"Inside"}},
		{"top level", "?parent_id=null", http.StatusOK, []string{"Folder", "A note", "Root note"}},
		{"unknown folder", "?parent_id=" + uuid.New().String(), http.StatusNotFound, nil},
		{"another user's folder", "?parent_id=" + foreign.ID.String(), http.StatusNotFound, nil},
		{"a note is not a parent", "?parent_id=" + note.ID.String(), http.StatusBadRequest, nil},
		{"not a uuid", "?parent_id=abc", http.StatusBadRequest, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := doJSON(t, r, http.MethodGet, "/api/v1/items"+tt.query, nil)
			wantStatus(t, w, tt.want)
			if tt.want == http.StatusOK {
				if got := names(decodeItems(t, w)); !equalStrings(got, tt.names) {
					t.Errorf("items = %v, want %v", got, tt.names)
				}
			}
		})
	}
}

func TestGetItem(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	mine := addNote(db, userID, "Mine", nil)
	theirs := addNote(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, itemPath(mine.ID), nil)
	wantStatus(t, w, http.StatusOK)
	if got := decodeItem(t, w); got.ID != mine.ID || got.Name != "Mine" {
		t.Errorf("got %+v, want the requested item", got)
	}
	if strings.Contains(w.Body.String(), "content") {
		t.Errorf("an item must not carry note content: %s", w.Body.String())
	}

	wantStatus(t, doJSON(t, r, http.MethodGet, itemPath(theirs.ID), nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodGet, itemPath(uuid.New()), nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodGet, "/api/v1/items/not-a-uuid", nil), http.StatusBadRequest)
}

func TestUpdateItemPartial(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note := addNote(db, userID, "Old", nil)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPatch, itemPath(note.ID), `{"name":"  New  ","is_favorite":true}`)
	wantStatus(t, w, http.StatusOK)
	got := decodeItem(t, w)
	if got.Name != "New" || !got.IsFavorite {
		t.Errorf("got %+v, want name New and favorite", got)
	}
	if got.Icon != note.Icon {
		t.Errorf("icon = %q, want it unchanged (%q)", got.Icon, note.Icon)
	}

	w = doJSON(t, r, http.MethodPatch, itemPath(note.ID), `{"icon":"🚀"}`)
	wantStatus(t, w, http.StatusOK)
	got = decodeItem(t, w)
	if got.Icon != "🚀" || got.Name != "New" || !got.IsFavorite {
		t.Errorf("got %+v, want only the icon changed", got)
	}

	w = doJSON(t, r, http.MethodPatch, itemPath(note.ID), `{"is_favorite":false}`)
	wantStatus(t, w, http.StatusOK)
	if decodeItem(t, w).IsFavorite {
		t.Error("favorite = true, want false: an explicit false must be applied")
	}
}

func TestUpdateItemEmptyIconResetsToTypeDefault(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "F", nil)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPatch, itemPath(folder.ID), `{"icon":""}`)
	wantStatus(t, w, http.StatusOK)
	if got := decodeItem(t, w).Icon; got != "📁" {
		t.Errorf("icon = %q, want the folder default", got)
	}
}

func TestUpdateItemRejectsInvalidRequests(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	note := addNote(db, userID, "Mine", nil)
	theirs := addNote(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)

	tests := []struct {
		name string
		path string
		body string
		want int
	}{
		{"nothing to update", itemPath(note.ID), `{}`, http.StatusBadRequest},
		{"blank name", itemPath(note.ID), `{"name":" "}`, http.StatusBadRequest},
		{"name too long", itemPath(note.ID), `{"name":"` + strings.Repeat("a", 256) + `"}`, http.StatusBadRequest},
		{"parent_id is not editable here", itemPath(note.ID), `{"parent_id":null}`, http.StatusBadRequest},
		{"type is not editable", itemPath(note.ID), `{"type":"folder"}`, http.StatusBadRequest},
		{"user_id is not editable", itemPath(note.ID), `{"user_id":"` + otherID.String() + `"}`, http.StatusBadRequest},
		{"another user's item", itemPath(theirs.ID), `{"name":"hijacked"}`, http.StatusNotFound},
		{"missing item", itemPath(uuid.New()), `{"name":"x"}`, http.StatusNotFound},
		{"bad id", "/api/v1/items/nope", `{"name":"x"}`, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodPatch, tt.path, tt.body), tt.want)
		})
	}
	if db.Items[theirs.ID].Name != "Theirs" || db.Items[note.ID].Name != "Mine" || db.Items[note.ID].UserID != userID {
		t.Error("a rejected update changed stored data")
	}
}

func TestDeleteNoteRemovesContent(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note := addNote(db, userID, "Gone", nil)
	keep := addNote(db, userID, "Keep", nil)
	r := newItemsRouter(db, &userID)

	wantStatus(t, doJSON(t, r, http.MethodDelete, itemPath(note.ID), nil), http.StatusNoContent)
	if _, ok := db.Items[note.ID]; ok {
		t.Error("note still stored")
	}
	if _, ok := db.Contents[note.ID]; ok {
		t.Error("note content still stored")
	}
	if _, ok := db.Items[keep.ID]; !ok {
		t.Error("an unrelated note was deleted")
	}
}

func TestDeleteFolderDeletesItsSubtree(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	top := addFolder(db, userID, "Top", nil)
	sub := addFolder(db, userID, "Sub", &top.ID)
	deep := addNote(db, userID, "Deep", &sub.ID)
	outside := addNote(db, userID, "Outside", nil)
	r := newItemsRouter(db, &userID)

	wantStatus(t, doJSON(t, r, http.MethodDelete, itemPath(top.ID), nil), http.StatusNoContent)
	for _, id := range []uuid.UUID{top.ID, sub.ID, deep.ID} {
		if _, ok := db.Items[id]; ok {
			t.Errorf("item %v survived deleting its ancestor folder", id)
		}
	}
	if _, ok := db.Contents[deep.ID]; ok {
		t.Error("content of a deleted note survived")
	}
	if _, ok := db.Items[outside.ID]; !ok {
		t.Error("a note outside the folder was deleted")
	}
}

func TestDeleteItemOwnership(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	theirs := addNote(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)

	wantStatus(t, doJSON(t, r, http.MethodDelete, itemPath(theirs.ID), nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodDelete, itemPath(uuid.New()), nil), http.StatusNotFound)
	wantStatus(t, doJSON(t, r, http.MethodDelete, "/api/v1/items/nope", nil), http.StatusBadRequest)
	if _, ok := db.Items[theirs.ID]; !ok {
		t.Error("another user's item was deleted")
	}
}

func TestMoveItemsIntoFolderTakesTheSubtreeAlong(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	dest := addFolder(db, userID, "Dest", nil)
	src := addFolder(db, userID, "Src", nil)
	child := addNote(db, userID, "Child", &src.ID)
	loose := addNote(db, userID, "Loose", nil)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPatch, "/api/v1/items", map[string]any{"items": []map[string]any{
		{"id": src.ID, "parent_id": dest.ID},
		{"id": loose.ID, "parent_id": dest.ID},
	}})
	wantStatus(t, w, http.StatusOK)

	moved := decodeItems(t, w)
	if len(moved) != 2 || moved[0].ID != src.ID || moved[1].ID != loose.ID {
		t.Fatalf("response = %v, want the moved items in request order", names(moved))
	}
	for _, id := range []uuid.UUID{src.ID, loose.ID} {
		if p := db.Items[id].ParentID; p == nil || *p != dest.ID {
			t.Errorf("item %v parent = %v, want %v", id, p, dest.ID)
		}
	}
	if p := db.Items[child.ID].ParentID; p == nil || *p != src.ID {
		t.Errorf("the folder's child was re-parented to %v, want it to stay in %v", p, src.ID)
	}
	if len(db.Items) != 4 {
		t.Errorf("%d items stored, want 4: a move must not create or remove anything", len(db.Items))
	}
}

func TestMoveItemsToTopLevel(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Folder", nil)
	note := addNote(db, userID, "Note", &folder.ID)
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPatch, "/api/v1/items", `{"items":[{"id":"`+note.ID.String()+`","parent_id":null}]}`)
	wantStatus(t, w, http.StatusOK)
	if db.Items[note.ID].ParentID != nil {
		t.Errorf("parent = %v, want nil", db.Items[note.ID].ParentID)
	}
}

func TestMoveItemsNoChangeLeavesItemUntouched(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Folder", nil)
	note := addNote(db, userID, "Note", &folder.ID)
	before := db.Items[note.ID]
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPatch, "/api/v1/items", map[string]any{"items": []map[string]any{{"id": note.ID, "parent_id": folder.ID}}})
	wantStatus(t, w, http.StatusOK)
	if got := decodeItems(t, w); len(got) != 1 || got[0].ID != note.ID {
		t.Errorf("response = %v, want the unchanged item", got)
	}
	if !db.Items[note.ID].UpdatedAt.Equal(before.UpdatedAt) {
		t.Error("a no-op move bumped updated_at")
	}
}

func TestMoveItemsRejections(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	top := addFolder(db, userID, "Top", nil)
	sub := addFolder(db, userID, "Sub", &top.ID)
	leaf := addFolder(db, userID, "Leaf", &sub.ID)
	note := addNote(db, userID, "Note", nil)
	other := addFolder(db, userID, "Other", nil)
	foreignFolder := addFolder(db, otherID, "Theirs", nil)
	foreignNote := addNote(db, otherID, "Their note", nil)
	r := newItemsRouter(db, &userID)

	entry := func(id uuid.UUID, parent any) map[string]any { return map[string]any{"id": id, "parent_id": parent} }
	tests := []struct {
		name  string
		items []map[string]any
		want  int
	}{
		{"into a note", []map[string]any{entry(other.ID, note.ID)}, http.StatusBadRequest},
		{"into itself", []map[string]any{entry(top.ID, top.ID)}, http.StatusBadRequest},
		{"into its own descendant", []map[string]any{entry(top.ID, leaf.ID)}, http.StatusBadRequest},
		{"swap that forms a cycle", []map[string]any{entry(other.ID, top.ID), entry(top.ID, other.ID)}, http.StatusBadRequest},
		{"into a missing folder", []map[string]any{entry(note.ID, uuid.New())}, http.StatusNotFound},
		{"into another user's folder", []map[string]any{entry(note.ID, foreignFolder.ID)}, http.StatusNotFound},
		{"another user's item", []map[string]any{entry(foreignNote.ID, other.ID)}, http.StatusNotFound},
		{"a missing item", []map[string]any{entry(uuid.New(), nil)}, http.StatusNotFound},
		{"the same item twice", []map[string]any{entry(note.ID, other.ID), entry(note.ID, nil)}, http.StatusBadRequest},
		{"one bad entry fails the whole request", []map[string]any{entry(note.ID, other.ID), entry(other.ID, note.ID)}, http.StatusBadRequest},
		{"no items", []map[string]any{}, http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodPatch, "/api/v1/items", map[string]any{"items": tt.items}), tt.want)
			if db.Items[note.ID].ParentID != nil || db.Items[top.ID].ParentID != nil || db.Items[other.ID].ParentID != nil {
				t.Fatal("a rejected move changed stored data")
			}
		})
	}
}

func TestMoveItemsRequiresParentIDKey(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note := addNote(db, userID, "Note", nil)
	r := newItemsRouter(db, &userID)

	for name, body := range map[string]string{
		"missing parent_id": `{"items":[{"id":"` + note.ID.String() + `"}]}`,
		"missing id":        `{"items":[{"parent_id":null}]}`,
		"unknown field":     `{"items":[{"id":"` + note.ID.String() + `","parent_id":null,"name":"x"}]}`,
		"bad parent_id":     `{"items":[{"id":"` + note.ID.String() + `","parent_id":"nope"}]}`,
		"unknown top field": `{"items":[],"force":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, http.MethodPatch, "/api/v1/items", body), http.StatusBadRequest)
		})
	}
}

func TestMoveItemsTooManyItems(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newItemsRouter(db, &userID)

	entries := make([]map[string]any, services.MaxMoveItems+1)
	for i := range entries {
		entries[i] = map[string]any{"id": uuid.New(), "parent_id": nil}
	}
	wantStatus(t, doJSON(t, r, http.MethodPatch, "/api/v1/items", map[string]any{"items": entries}), http.StatusBadRequest)
}

func TestMoveItemsDatabaseConflictIsReported(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Folder", nil)
	note := addNote(db, userID, "Note", nil)
	db.Errs["MoveItems"] = database.ErrMoveConflict
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodPatch, "/api/v1/items", map[string]any{"items": []map[string]any{{"id": note.ID, "parent_id": folder.ID}}})
	wantStatus(t, w, http.StatusConflict)
}

func TestNoteContentRoundTrip(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note := addNote(db, userID, "Note", nil)
	before := db.Items[note.ID].UpdatedAt
	r := newItemsRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, itemPath(note.ID)+"/content", nil)
	wantStatus(t, w, http.StatusOK)
	var got model.NoteContent
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Content != "content of Note" || got.ItemID != note.ID {
		t.Errorf("got %+v, want the stored content", got)
	}

	w = doJSON(t, r, http.MethodPut, itemPath(note.ID)+"/content", `{"content":"<p>new</p>"}`)
	wantStatus(t, w, http.StatusOK)
	if db.Contents[note.ID].Content != "<p>new</p>" {
		t.Errorf("stored content = %q, want the new body", db.Contents[note.ID].Content)
	}
	if !db.Items[note.ID].UpdatedAt.After(before) {
		t.Error("saving content must bump the note's updated_at")
	}

	wantStatus(t, doJSON(t, r, http.MethodPut, itemPath(note.ID)+"/content", `{"content":""}`), http.StatusOK)
	if db.Contents[note.ID].Content != "" {
		t.Error("an empty body must be storable")
	}
}

func TestNoteContentRejections(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID, otherID := uuid.New(), uuid.New()
	note := addNote(db, userID, "Note", nil)
	folder := addFolder(db, userID, "Folder", nil)
	theirs := addNote(db, otherID, "Theirs", nil)
	r := newItemsRouter(db, &userID)

	tests := []struct {
		name         string
		method, path string
		body         string
		want         int
	}{
		{"get a folder's content", http.MethodGet, itemPath(folder.ID) + "/content", "", http.StatusBadRequest},
		{"put a folder's content", http.MethodPut, itemPath(folder.ID) + "/content", `{"content":"x"}`, http.StatusBadRequest},
		{"get another user's content", http.MethodGet, itemPath(theirs.ID) + "/content", "", http.StatusNotFound},
		{"put another user's content", http.MethodPut, itemPath(theirs.ID) + "/content", `{"content":"x"}`, http.StatusNotFound},
		{"get a missing note", http.MethodGet, itemPath(uuid.New()) + "/content", "", http.StatusNotFound},
		{"missing content field", http.MethodPut, itemPath(note.ID) + "/content", `{}`, http.StatusBadRequest},
		{"null content", http.MethodPut, itemPath(note.ID) + "/content", `{"content":null}`, http.StatusBadRequest},
		{"unknown field", http.MethodPut, itemPath(note.ID) + "/content", `{"content":"x","name":"y"}`, http.StatusBadRequest},
		{"content too large", http.MethodPut, itemPath(note.ID) + "/content", `{"content":"` + strings.Repeat("a", services.MaxContentBytes+1) + `"}`, http.StatusRequestEntityTooLarge},
		{"bad id", http.MethodGet, "/api/v1/items/nope/content", "", http.StatusBadRequest},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantStatus(t, doJSON(t, r, tt.method, tt.path, tt.body), tt.want)
		})
	}
	if db.Contents[note.ID].Content != "content of Note" || db.Contents[theirs.ID].Content != "content of Theirs" {
		t.Error("a rejected request changed stored content")
	}
}
