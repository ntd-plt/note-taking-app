package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"backend/internal/handlers"
	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// newNotesRouter registers the notes routes behind a stub auth middleware
// that stores userID in the context, as middleware.Auth would. Pass nil to
// simulate an unauthenticated request.
func newNotesRouter(db *testutil.FakeDatabase, userID *uuid.UUID) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := handlers.NewNotesHandler(db)

	r := gin.New()
	r.Use(func(c *gin.Context) {
		if userID != nil {
			c.Set("userID", *userID)
		}
	})
	r.POST("/api/notes", h.CreateNote)
	r.GET("/api/notes", h.GetNotes)
	r.GET("/api/notes/:id", h.GetNote)
	r.PUT("/api/notes", h.UpdateNotes)
	r.DELETE("/api/notes", h.DeleteNotes)
	return r
}

func addNote(db *testutil.FakeDatabase, userID uuid.UUID, title string) model.Note {
	note := model.Note{
		ID:      uuid.New(),
		Title:   title,
		Content: "content of " + title,
		UserID:  userID,
	}
	db.Notes[note.ID] = note
	return note
}

func TestCreateNoteSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/notes", handlers.CreateNoteRequest{
		Title:   "My note",
		Content: "Hello",
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}

	var created model.Note
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if created.Title != "My note" || created.Content != "Hello" {
		t.Errorf("created note = %+v, want title %q and content %q", created, "My note", "Hello")
	}
	if created.UserID != userID {
		t.Errorf("note owner = %v, want authenticated user %v", created.UserID, userID)
	}
	if created.FolderID != nil {
		t.Errorf("folder ID = %v, want nil for a note outside any folder", created.FolderID)
	}
	if _, ok := db.Notes[created.ID]; !ok {
		t.Error("note not stored in database")
	}
}

func TestCreateNoteInFolder(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folderID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/notes", handlers.CreateNoteRequest{
		Title:    "My note",
		Content:  "Hello",
		FolderID: &folderID,
	})

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusCreated, w.Body.String())
	}

	var created model.Note
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if created.FolderID == nil || *created.FolderID != folderID {
		t.Errorf("folder ID = %v, want %v", created.FolderID, folderID)
	}
}

func TestCreateNoteMissingFields(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodPost, "/api/notes", map[string]string{"title": "no content"})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestCreateNoteUnauthenticated(t *testing.T) {
	db := testutil.NewFakeDatabase()
	r := newNotesRouter(db, nil)

	w := doJSON(t, r, http.MethodPost, "/api/notes", handlers.CreateNoteRequest{
		Title:   "My note",
		Content: "Hello",
	})

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusUnauthorized, w.Body.String())
	}
}

func TestGetNoteSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note := addNote(db, userID, "My note")
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/notes/"+note.ID.String(), nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}

	var got model.Note
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.ID != note.ID || got.Title != note.Title {
		t.Errorf("got note %+v, want %+v", got, note)
	}
}

func TestGetNoteInvalidID(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/notes/not-a-uuid", nil)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestGetNoteNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/notes/"+uuid.NewString(), nil)

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
	}
}

func TestGetNoteOwnedByAnotherUser(t *testing.T) {
	db := testutil.NewFakeDatabase()
	owner := uuid.New()
	note := addNote(db, owner, "Owner's note")
	otherUser := uuid.New()
	r := newNotesRouter(db, &otherUser)

	w := doJSON(t, r, http.MethodGet, "/api/notes/"+note.ID.String(), nil)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
}

func TestGetNotesReturnsOnlyOwnNotes(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	addNote(db, userID, "Mine 1")
	addNote(db, userID, "Mine 2")
	addNote(db, uuid.New(), "Someone else's")
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodGet, "/api/notes", nil)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}

	var notes []model.Note
	if err := json.Unmarshal(w.Body.Bytes(), &notes); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(notes) != 2 {
		t.Fatalf("got %d notes, want 2", len(notes))
	}
	for _, n := range notes {
		if n.UserID != userID {
			t.Errorf("note %q belongs to %v, want only notes of %v", n.Title, n.UserID, userID)
		}
	}
}

func TestUpdateNotesSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note := addNote(db, userID, "Old title")
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodPut, "/api/notes", handlers.UpdateNotesRequest{
		Notes: []handlers.UpdateNoteItem{
			{ID: note.ID, Title: "New title", Content: "New content"},
		},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	updated := db.Notes[note.ID]
	if updated.Title != "New title" || updated.Content != "New content" {
		t.Errorf("stored note = %+v, want updated title and content", updated)
	}
}

func TestUpdateNotesNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodPut, "/api/notes", handlers.UpdateNotesRequest{
		Notes: []handlers.UpdateNoteItem{
			{ID: uuid.New(), Title: "New title"},
		},
	})

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
	}
}

func TestUpdateNotesForbidden(t *testing.T) {
	db := testutil.NewFakeDatabase()
	note := addNote(db, uuid.New(), "Owner's note")
	otherUser := uuid.New()
	r := newNotesRouter(db, &otherUser)

	w := doJSON(t, r, http.MethodPut, "/api/notes", handlers.UpdateNotesRequest{
		Notes: []handlers.UpdateNoteItem{
			{ID: note.ID, Title: "Hijacked"},
		},
	})

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
	if db.Notes[note.ID].Title != "Owner's note" {
		t.Error("note was modified despite forbidden response")
	}
}

func TestUpdateNotesEmptyList(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodPut, "/api/notes", handlers.UpdateNotesRequest{Notes: []handlers.UpdateNoteItem{}})

	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusBadRequest, w.Body.String())
	}
}

func TestDeleteNotesSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	note1 := addNote(db, userID, "Note 1")
	note2 := addNote(db, userID, "Note 2")
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodDelete, "/api/notes", handlers.DeleteNotesRequest{
		IDs: []uuid.UUID{note1.ID, note2.ID},
	})

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusOK, w.Body.String())
	}
	if len(db.Notes) != 0 {
		t.Errorf("%d notes remain, want 0", len(db.Notes))
	}
}

func TestDeleteNotesNotFound(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	r := newNotesRouter(db, &userID)

	w := doJSON(t, r, http.MethodDelete, "/api/notes", handlers.DeleteNotesRequest{
		IDs: []uuid.UUID{uuid.New()},
	})

	if w.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusNotFound, w.Body.String())
	}
}

func TestDeleteNotesForbidden(t *testing.T) {
	db := testutil.NewFakeDatabase()
	note := addNote(db, uuid.New(), "Owner's note")
	otherUser := uuid.New()
	r := newNotesRouter(db, &otherUser)

	w := doJSON(t, r, http.MethodDelete, "/api/notes", handlers.DeleteNotesRequest{
		IDs: []uuid.UUID{note.ID},
	})

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want %d; body: %s", w.Code, http.StatusForbidden, w.Body.String())
	}
	if _, ok := db.Notes[note.ID]; !ok {
		t.Error("note was deleted despite forbidden response")
	}
}
