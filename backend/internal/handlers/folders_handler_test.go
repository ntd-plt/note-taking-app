package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"backend/internal/handlers"
	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// newFoldersRouter registers the folders routes behind a stub auth middleware
// that stores userID in the context, as middleware.Auth would. Pass nil to
// simulate an unauthenticated request.
func newFoldersRouter(db *testutil.FakeDatabase, userID *uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := handlers.NewFoldersHandler(db)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if userID != nil {
			c.Set("userID", *userID)
		}
	})
	r.POST("/api/folders", h.CreateFolder)
	r.GET("/api/folders", h.GetFolders)
	r.GET("/api/folders/:id", h.GetFolder)
	r.PUT("/api/folders", h.UpdateFolders)
	r.DELETE("/api/folders", h.DeleteFolders)
	return r
}

func addFolder(db *testutil.FakeDatabase, userID uuid.UUID, name string, parentID *uuid.UUID) model.Folder {
	folder := model.Folder{
		ID:             uuid.New(),
		Name:           name,
		ParentFolderID: parentID,
		UserID:         userID,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	db.Folders[folder.ID] = folder
	return folder
}

func TestCreateFolderSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/folders", handlers.CreateFolderRequest{
		Name: "Documents",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}

	var created model.Folder
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if created.Name != "Documents" || created.UserID != userID {
		t.Errorf("created folder = %+v, want name %q owned by %v", created, "Documents", userID)
	}
	if _, ok := db.Folders[created.ID]; !ok {
		t.Error("folder not stored in database")
	}
}

func TestCreateFolderNested(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	parent := addFolder(db, userID, "Parent", nil)
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/folders", handlers.CreateFolderRequest{
		Name:           "Child",
		ParentFolderID: &parent.ID,
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}

	var created model.Folder
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if created.ParentFolderID == nil || *created.ParentFolderID != parent.ID {
		t.Errorf("parent folder ID = %v, want %v", created.ParentFolderID, parent.ID)
	}
}

func TestCreateFolderMissingName(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/folders", map[string]any{"parent_folder_id": nil})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestCreateFolderUnauthenticated(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newFoldersRouter(db, nil)

	w := doJSON(t, r, http.MethodPost, "/api/folders", handlers.CreateFolderRequest{
		Name: "Documents",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
	if len(db.Folders) != 0 {
		t.Error("folder was created despite unauthorized response")
	}
}

func TestGetFolderWithChildren(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Parent", nil)
	child := addFolder(db, userID, "Child", &folder.ID)
	note := model.Note{ID: uuid.New(), Title: "Note in folder", FolderID: &folder.ID, UserID: userID, UpdatedAt: time.Now()}
	db.Notes[note.ID] = note
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/folders/"+folder.ID.String(), nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}

	var resp handlers.FolderResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if resp.ID != folder.ID.String() || resp.Name != "Parent" {
		t.Errorf("folder = %+v, want ID %v and name %q", resp, folder.ID, "Parent")
	}
	if len(resp.Children) != 2 {
		t.Fatalf("got %d children, want 2 (one folder, one note); children: %+v", len(resp.Children), resp.Children)
	}
	types := map[string]string{}
	for _, item := range resp.Children {
		types[item.ID] = item.Type
		if item.UpdatedAt.IsZero() {
			t.Errorf("child %v has zero updated_at", item.ID)
		}
	}
	if types[child.ID.String()] != "folder" {
		t.Errorf("child folder %v has type %q, want %q", child.ID, types[child.ID.String()], "folder")
	}
	if types[note.ID.String()] != "note" {
		t.Errorf("child note %v has type %q, want %q", note.ID, types[note.ID.String()], "note")
	}
}

func TestGetFolderInvalidID(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/folders/not-a-uuid", nil)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestGetFolderNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/folders/"+uuid.NewString(), nil)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
	}
}

func TestGetFolderOwnedByAnotherUser(t *testing.T) {
	db := testutil.NewFakeDatabase()
	folder := addFolder(db, uuid.New(), "Owner's folder", nil)
	otherUser := uuid.New()
	r := newFoldersRouter(db, &otherUser)

	w := doJSON(t, r, http.MethodGet, "/api/folders/"+folder.ID.String(), nil)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
}

func TestGetFoldersReturnsOnlyOwnFolders(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	addFolder(db, userID, "Mine 1", nil)
	addFolder(db, userID, "Mine 2", nil)
	addFolder(db, uuid.New(), "Someone else's", nil)
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/folders", nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}

	var folders []model.Folder
	if err := json.Unmarshal(w.Body.Bytes(), &folders); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(folders) != 2 {
		t.Fatalf("got %d folders, want 2", len(folders))
	}
	for _, f := range folders {
		if f.UserID != userID {
			t.Errorf("folder %q belongs to %v, want only folders of %v", f.Name, f.UserID, userID)
		}
	}
}

func TestGetFoldersUnauthenticated(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newFoldersRouter(db, nil)

	w := doJSON(t, r, http.MethodGet, "/api/folders", nil)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestUpdateFoldersSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Old name", nil)
	newParent := addFolder(db, userID, "New parent", nil)
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodPut, "/api/folders", handlers.UpdateFoldersRequest{
		Folders: []handlers.UpdateFolderItem{
			{ID: folder.ID, Name: "New name", ParentFolderID: &newParent.ID},
		},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	updated := db.Folders[folder.ID]
	if updated.Name != "New name" {
		t.Errorf("stored name = %q, want %q", updated.Name, "New name")
	}
	if updated.ParentFolderID == nil || *updated.ParentFolderID != newParent.ID {
		t.Errorf("stored parent = %v, want %v", updated.ParentFolderID, newParent.ID)
	}
}

func TestUpdateFoldersNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodPut, "/api/folders", handlers.UpdateFoldersRequest{
		Folders: []handlers.UpdateFolderItem{
			{ID: uuid.New(), Name: "New name"},
		},
	})

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
	}
}

func TestUpdateFoldersForbidden(t *testing.T) {
	db := testutil.NewFakeDatabase()
	folder := addFolder(db, uuid.New(), "Owner's folder", nil)
	otherUser := uuid.New()
	r := newFoldersRouter(db, &otherUser)

	w := doJSON(t, r, http.MethodPut, "/api/folders", handlers.UpdateFoldersRequest{
		Folders: []handlers.UpdateFolderItem{
			{ID: folder.ID, Name: "Hijacked"},
		},
	})

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
	if db.Folders[folder.ID].Name != "Owner's folder" {
		t.Error("folder was modified despite forbidden response")
	}
}

func TestUpdateFoldersEmptyList(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodPut, "/api/folders", handlers.UpdateFoldersRequest{Folders: []handlers.UpdateFolderItem{}})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestDeleteFoldersSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder1 := addFolder(db, userID, "Folder 1", nil)
	folder2 := addFolder(db, userID, "Folder 2", nil)
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodDelete, "/api/folders", handlers.DeleteFoldersRequest{
		IDs: []uuid.UUID{folder1.ID, folder2.ID},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	if len(db.Folders) != 0 {
		t.Errorf("%d folders remain, want 0", len(db.Folders))
	}
}

func TestDeleteFoldersNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newFoldersRouter(db, &userID)

	w := doJSON(t, r, http.MethodDelete, "/api/folders", handlers.DeleteFoldersRequest{
		IDs: []uuid.UUID{uuid.New()},
	})

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
	}
}

func TestDeleteFoldersForbidden(t *testing.T) {
	db := testutil.NewFakeDatabase()
	folder := addFolder(db, uuid.New(), "Owner's folder", nil)
	otherUser := uuid.New()
	r := newFoldersRouter(db, &otherUser)

	w := doJSON(t, r, http.MethodDelete, "/api/folders", handlers.DeleteFoldersRequest{
		IDs: []uuid.UUID{folder.ID},
	})

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
	if _, ok := db.Folders[folder.ID]; !ok {
		t.Error("folder was deleted despite forbidden response")
	}
}
