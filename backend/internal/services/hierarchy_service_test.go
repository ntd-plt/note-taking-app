package services_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"backend/internal/database"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// newHierarchyRouter registers the move route behind a stub auth middleware.
// Pass nil to simulate an unauthenticated request.
func newHierarchyRouter(db *testutil.FakeDatabase, userID *uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := services.NewHierarchyService(db)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if userID != nil {
			c.Set("userID", *userID)
		}
	})
	r.POST("/api/hierarchy/move", h.MoveItems)
	r.POST("/api/hierarchy/duplicate", h.DuplicateItems)
	return r
}

func decodeMove(t *testing.T, body []byte) services.MoveItemsResponse {
	t.Helper()
	var resp services.MoveItemsResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("decoding response %q: %v", body, err)
	}
	return resp
}

func TestMoveItemsMovesNoteAndFolderIntoFolder(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	dest := addFolder(db, userID, "Dest", nil)
	folder := addFolder(db, userID, "Docs", nil)
	note := addNote(db, userID, "Todo")
	r := newHierarchyRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/move", services.MoveItemsRequest{
		Items:               []services.MoveItemRef{{ID: folder.ID, Type: "folder"}, {ID: note.ID, Type: "note"}},
		DestinationFolderID: &dest.ID,
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
	}
	resp := decodeMove(t, w.Body.Bytes())
	if len(resp.Moved.Folders) != 1 || len(resp.Moved.Notes) != 1 {
		t.Errorf("moved = %d folders, %d notes; want 1 and 1", len(resp.Moved.Folders), len(resp.Moved.Notes))
	}
	if len(resp.Created.Folders)+len(resp.Created.Notes) != 0 {
		t.Errorf("created = %+v, want nothing", resp.Created)
	}
	if got := db.Folders[folder.ID].ParentFolderID; got == nil || *got != dest.ID {
		t.Errorf("folder parent = %v, want %v", got, dest.ID)
	}
	if got := db.Notes[note.ID].FolderID; got == nil || *got != dest.ID {
		t.Errorf("note folder = %v, want %v", got, dest.ID)
	}
	if db.Folders[folder.ID].Name != "Docs" || db.Notes[note.ID].Title != "Todo" {
		t.Error("moved items must keep their names")
	}
}

func TestMoveItemsToRoot(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	parent := addFolder(db, userID, "Parent", nil)
	child := addFolder(db, userID, "Child", &parent.ID)
	r := newHierarchyRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/move", services.MoveItemsRequest{
		Items:               []services.MoveItemRef{{ID: child.ID, Type: "folder"}},
		DestinationFolderID: nil,
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
	}
	if got := db.Folders[child.ID].ParentFolderID; got != nil {
		t.Errorf("parent = %v, want nil (top level)", *got)
	}
}

func TestMoveItemsClonesNestedSelection(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	dest := addFolder(db, userID, "Dest", nil)
	a := addFolder(db, userID, "A", nil)
	b := addNote(db, userID, "B")
	b.FolderID = &a.ID
	b.Icon = "🚀"
	b.IsFavorite = true
	db.Notes[b.ID] = b
	r := newHierarchyRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/move", services.MoveItemsRequest{
		Items:               []services.MoveItemRef{{ID: a.ID, Type: "folder"}, {ID: b.ID, Type: "note"}},
		DestinationFolderID: &dest.ID,
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
	}
	resp := decodeMove(t, w.Body.Bytes())
	if len(resp.Created.Notes) != 1 {
		t.Fatalf("created notes = %d, want 1", len(resp.Created.Notes))
	}
	clone := resp.Created.Notes[0]
	if clone.ID == b.ID || clone.Title != "B (Copy 1)" {
		t.Errorf("clone = %+v, want a new id titled %q", clone, "B (Copy 1)")
	}
	if clone.Content != b.Content || clone.Icon != "🚀" || !clone.IsFavorite {
		t.Errorf("clone must keep content, icon and favorite flag: %+v", clone)
	}
	if clone.FolderID == nil || *clone.FolderID != dest.ID {
		t.Errorf("clone folder = %v, want destination", clone.FolderID)
	}
	if got := db.Notes[b.ID].FolderID; got == nil || *got != a.ID {
		t.Errorf("original note must stay inside A, got folder %v", got)
	}
}

func TestMoveItemsRejectsCycle(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	parent := addFolder(db, userID, "Parent", nil)
	child := addFolder(db, userID, "Child", &parent.ID)
	r := newHierarchyRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/move", services.MoveItemsRequest{
		Items:               []services.MoveItemRef{{ID: parent.ID, Type: "folder"}},
		DestinationFolderID: &child.ID,
	})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400; body: %s", w.Code, w.Body.String())
	}
	if db.Folders[parent.ID].ParentFolderID != nil {
		t.Error("rejected move must not change the folder")
	}
}

func TestMoveItemsErrors(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	otherID := uuid.New()
	mine := addFolder(db, userID, "Mine", nil)
	theirs := addFolder(db, otherID, "Theirs", nil)
	theirNote := addNote(db, otherID, "Secret")
	unknown := uuid.New()

	cases := []struct {
		name string
		req  services.MoveItemsRequest
		want int
	}{
		{"foreign destination", services.MoveItemsRequest{
			Items: []services.MoveItemRef{{ID: mine.ID, Type: "folder"}}, DestinationFolderID: &theirs.ID}, http.StatusForbidden},
		{"foreign item", services.MoveItemsRequest{
			Items: []services.MoveItemRef{{ID: theirNote.ID, Type: "note"}}, DestinationFolderID: &mine.ID}, http.StatusForbidden},
		{"unknown destination", services.MoveItemsRequest{
			Items: []services.MoveItemRef{{ID: mine.ID, Type: "folder"}}, DestinationFolderID: &unknown}, http.StatusNotFound},
		{"unknown item", services.MoveItemsRequest{
			Items: []services.MoveItemRef{{ID: unknown, Type: "note"}}, DestinationFolderID: &mine.ID}, http.StatusNotFound},
		{"empty items", services.MoveItemsRequest{Items: []services.MoveItemRef{}}, http.StatusBadRequest},
		{"bad type", services.MoveItemsRequest{
			Items: []services.MoveItemRef{{ID: mine.ID, Type: "tag"}}}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := doJSON(t, newHierarchyRouter(db, &userID), http.MethodPost, "/api/hierarchy/move", tc.req)
			if w.Code != tc.want {
				t.Errorf("status = %d, want %d; body: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
	if db.Notes[theirNote.ID].FolderID != nil || db.Folders[mine.ID].ParentFolderID != nil {
		t.Error("rejected requests must not change anything")
	}
}

func TestMoveItemsUnauthenticated(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newHierarchyRouter(db, nil)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/move", services.MoveItemsRequest{
		Items: []services.MoveItemRef{{ID: uuid.New(), Type: "note"}},
	})

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}

func TestMoveItemsConflictAndServerErrors(t *testing.T) {
	cases := []struct {
		name   string
		method string
		err    error
		want   int
	}{
		{"apply conflict", "ApplyMove", database.ErrMoveConflict, http.StatusConflict},
		{"apply failure", "ApplyMove", errors.New("boom"), http.StatusInternalServerError},
		{"load failure", "LoadHierarchy", errors.New("boom"), http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db := testutil.NewFakeDatabase()
			userID := uuid.New()
			note := addNote(db, userID, "N")
			db.Errs[tc.method] = tc.err
			r := newHierarchyRouter(db, &userID)

			w := doJSON(t, r, http.MethodPost, "/api/hierarchy/move", services.MoveItemsRequest{
				Items: []services.MoveItemRef{{ID: note.ID, Type: "note"}},
			})

			if w.Code != tc.want {
				t.Errorf("status = %d, want %d; body: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestDuplicateItemsCopiesNextToTheOriginal(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Docs", nil)
	note := addNote(db, userID, "Todo")
	note.FolderID = &folder.ID
	note.Icon = "🚀"
	note.IsFavorite = true
	db.Notes[note.ID] = note
	r := newHierarchyRouter(db, &userID)

	for _, want := range []string{"Todo (Copy 1)", "Todo (Copy 2)"} {
		w := doJSON(t, r, http.MethodPost, "/api/hierarchy/duplicate", services.DuplicateItemsRequest{
			Items: []services.MoveItemRef{{ID: note.ID, Type: "note"}},
		})

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
		}
		resp := decodeMove(t, w.Body.Bytes())
		if len(resp.Moved.Folders)+len(resp.Moved.Notes) != 0 {
			t.Errorf("duplicate must not move anything: %+v", resp.Moved)
		}
		if len(resp.Created.Notes) != 1 {
			t.Fatalf("created notes = %d, want 1", len(resp.Created.Notes))
		}
		copy := resp.Created.Notes[0]
		if copy.Title != want || copy.ID == note.ID {
			t.Errorf("copy = %q (%v), want a new note titled %q", copy.Title, copy.ID, want)
		}
		if copy.FolderID == nil || *copy.FolderID != folder.ID {
			t.Errorf("copy folder = %v, want the original's folder %v", copy.FolderID, folder.ID)
		}
		if copy.Content != note.Content || copy.Icon != "🚀" || !copy.IsFavorite {
			t.Errorf("copy must keep content, icon and favorite flag: %+v", copy)
		}
	}
	if got := db.Notes[note.ID]; got.Title != "Todo" || got.FolderID == nil || *got.FolderID != folder.ID {
		t.Errorf("original changed: %+v", got)
	}
}

func TestDuplicateItemsCopiesFolderRecursively(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	parent := addFolder(db, userID, "Parent", nil)
	docs := addFolder(db, userID, "Docs", &parent.ID)
	sub := addFolder(db, userID, "Sub", &docs.ID)
	inDocs := addNote(db, userID, "In docs")
	inDocs.FolderID = &docs.ID
	db.Notes[inDocs.ID] = inDocs
	inSub := addNote(db, userID, "In sub")
	inSub.FolderID = &sub.ID
	db.Notes[inSub.ID] = inSub
	r := newHierarchyRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/duplicate", services.DuplicateItemsRequest{
		Items: []services.MoveItemRef{{ID: docs.ID, Type: "folder"}},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body: %s", w.Code, w.Body.String())
	}
	resp := decodeMove(t, w.Body.Bytes())
	if len(resp.Created.Folders) != 2 || len(resp.Created.Notes) != 2 {
		t.Fatalf("created = %d folders, %d notes; want 2 and 2", len(resp.Created.Folders), len(resp.Created.Notes))
	}
	top := resp.Created.Folders[0]
	if top.Name != "Docs (Copy 1)" || top.ParentFolderID == nil || *top.ParentFolderID != parent.ID {
		t.Errorf("top copy = %q in %v, want %q beside the original in %v", top.Name, top.ParentFolderID, "Docs (Copy 1)", parent.ID)
	}
	if nested := resp.Created.Folders[1]; nested.Name != "Sub" || nested.ParentFolderID == nil || *nested.ParentFolderID != top.ID {
		t.Errorf("nested copy = %+v, want Sub inside the copied folder", nested)
	}
}

func TestDuplicateItemsErrors(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	theirs := addNote(db, uuid.New(), "Secret")
	unknown := uuid.New()

	cases := []struct {
		name string
		req  services.DuplicateItemsRequest
		want int
	}{
		{"foreign item", services.DuplicateItemsRequest{Items: []services.MoveItemRef{{ID: theirs.ID, Type: "note"}}}, http.StatusForbidden},
		{"unknown item", services.DuplicateItemsRequest{Items: []services.MoveItemRef{{ID: unknown, Type: "folder"}}}, http.StatusNotFound},
		{"empty", services.DuplicateItemsRequest{Items: []services.MoveItemRef{}}, http.StatusBadRequest},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := doJSON(t, newHierarchyRouter(db, &userID), http.MethodPost, "/api/hierarchy/duplicate", tc.req)
			if w.Code != tc.want {
				t.Errorf("status = %d, want %d; body: %s", w.Code, tc.want, w.Body.String())
			}
		})
	}
	if len(db.Notes) != 1 {
		t.Error("rejected requests must not create anything")
	}
}

func TestDuplicateItemsUnauthenticated(t *testing.T) {
	r := newHierarchyRouter(testutil.NewFakeDatabase(), nil)

	w := doJSON(t, r, http.MethodPost, "/api/hierarchy/duplicate", services.DuplicateItemsRequest{
		Items: []services.MoveItemRef{{ID: uuid.New(), Type: "note"}},
	})

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", w.Code)
	}
}
