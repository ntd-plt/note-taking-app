package handlers

import (
	"encoding/json"
	"net/http"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type NotesHandler struct {
	db database.Database
}

type CreateNoteRequest struct {
	ID       uuid.UUID  `json:"id"` // optional, if not provided, a new UUID will be generated
	Title    string     `json:"title" binding:"required"`
	Content  string     `json:"content"`
	FolderID *uuid.UUID `json:"folder_id"` // nil to create the note outside any folder
}

type UpdateNoteItem struct {
	ID       uuid.UUID
	Title    *string
	Content  *string
	FolderID *uuid.UUID

	// Flags to track presence in JSON
	UpdateTitle    bool
	UpdateContent  bool
	UpdateFolderID bool
}

func (item *UpdateNoteItem) UnmarshalJSON(data []byte) error {
	type Alias UpdateNoteItem
	var aux struct {
		ID       uuid.UUID  `json:"id" binding:"required"`
		Title    *string    `json:"title"`
		Content  *string    `json:"content"`
		FolderID *uuid.UUID `json:"folder_id"`
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	item.ID = aux.ID
	item.Title = aux.Title
	item.Content = aux.Content
	item.FolderID = aux.FolderID

	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	_, item.UpdateTitle = raw["title"]
	_, item.UpdateContent = raw["content"]
	_, item.UpdateFolderID = raw["folder_id"]

	return nil
}

type UpdateNotesRequest struct {
	Notes []UpdateNoteItem `json:"notes" binding:"required,min=1"`
}

type DeleteNotesRequest struct {
	IDs []uuid.UUID `json:"ids" binding:"required,min=1"`
}

func NewNotesHandler(db database.Database) *NotesHandler {
	return &NotesHandler{
		db: db,
	}
}

// CreateNote godoc
// @Summary      Create a note
// @Description  Creates a new note, optionally inside a folder
// @Tags         notes
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      CreateNoteRequest  true  "Note to create"
// @Success      201      {object}  model.Note
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/notes [post]
func (h *NotesHandler) CreateNote(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req CreateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	note := model.Note{
		ID:       req.ID,
		Title:    req.Title,
		Content:  req.Content,
		FolderID: req.FolderID,
		UserID:   userID.(uuid.UUID),
	}

	createdNote, err := h.db.CreateNote(note)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, createdNote)
}

// GetNote godoc
// @Summary      Get a note
// @Description  Returns a single note owned by the authenticated user
// @Tags         notes
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Note ID"
// @Success      200  {object}  model.Note
// @Failure      400  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Router       /api/notes/{id} [get]
func (h *NotesHandler) GetNote(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	noteID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid note id"})
		return
	}

	note, err := h.db.GetNoteByID(noteID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	if note.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to access this note"})
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *NotesHandler) GetNotes(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	notes, err := h.db.GetNotesByUserID(userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, notes)
}

// UpdateNotes godoc
// @Summary      Update multiple notes
// @Description  Updates the title and/or content of one or more notes in a single batch
// @Tags         notes
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      UpdateNotesRequest  true  "Notes to update"
// @Success      200      {array}   model.Note
// @Failure      400      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/notes [put]
func (h *NotesHandler) UpdateNotes(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req UpdateNotesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	notes := make([]model.Note, 0, len(req.Notes))
	for _, noteReq := range req.Notes {
		note, err := h.db.GetNoteByID(noteReq.ID)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "note not found", "id": noteReq.ID})
			return
		}

		if note.UserID != userID.(uuid.UUID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to update this note", "id": noteReq.ID})
			return
		}

		if noteReq.UpdateTitle {
			note.Title = *noteReq.Title
		}
		if noteReq.UpdateContent {
			note.Content = *noteReq.Content
		}
		if noteReq.UpdateFolderID {
			note.FolderID = noteReq.FolderID
		}
		notes = append(notes, note)
	}

	if err := h.db.UpdateNotes(notes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, notes)
}

// DeleteNotes godoc
// @Summary      Delete multiple notes
// @Description  Deletes one or more notes owned by the authenticated user in a single batch
// @Tags         notes
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      DeleteNotesRequest  true  "Note IDs to delete"
// @Success      200      {object}  map[string]string
// @Failure      400      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/notes [delete]
func (h *NotesHandler) DeleteNotes(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req DeleteNotesRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	for _, id := range req.IDs {
		note, err := h.db.GetNoteByID(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "note not found", "id": id})
			return
		}

		if note.UserID != userID.(uuid.UUID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to delete this note", "id": id})
			return
		}
	}

	if err := h.db.DeleteNotes(req.IDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "notes deleted successfully"})
}
