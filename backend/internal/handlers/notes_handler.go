package handlers

import (
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type NotesHandler struct {
	db           database.Database
	tokenService *services.JWTService
}

func NewNotesHandler(db database.Database, tokenService *services.JWTService) *NotesHandler {
	return &NotesHandler{
		db:           db,
		tokenService: tokenService,
	}
}

func (h *NotesHandler) CreateNote(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req struct {
		Title    string     `json:"title" binding:"required"`
		Content  string     `json:"content" binding:"required"`
		FolderID *uuid.UUID `json:"folder_id"` // nil to create the note outside any folder
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	note := model.Note{
		Title:   req.Title,
		Content: req.Content,
		UserID:  userID.(uuid.UUID),
	}

	createdNote, err := h.db.CreateNote(note, req.FolderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, createdNote)
}

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

func (h *NotesHandler) UpdateNotes(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req struct {
		Notes []struct {
			ID      uuid.UUID `json:"id" binding:"required"`
			Title   string    `json:"title"`
			Content string    `json:"content"`
		} `json:"notes" binding:"required,min=1"`
	}
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

		note.Title = noteReq.Title
		note.Content = noteReq.Content
		notes = append(notes, note)
	}

	if err := h.db.UpdateNotes(notes); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, notes)
}

func (h *NotesHandler) DeleteNotes(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req struct {
		IDs []uuid.UUID `json:"ids" binding:"required,min=1"`
	}
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
