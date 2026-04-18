package handlers

import (
	"fmt"
	"net/http"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/services"

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
		Title   string `json:"title" binding:"required"`
		Content string `json:"content" binding:"required"`
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

	createdNote, err := h.db.CreateNote(note)
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

	noteID := c.Param("id")
	var noteIDInt int
	_, err := fmt.Sscanf(noteID, "%d", &noteIDInt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid note id"})
		return
	}

	note, err := h.db.GetNoteByID(noteIDInt)
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

func (h *NotesHandler) UpdateNote(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	noteID := c.Param("id")
	var noteIDInt int
	_, err := fmt.Sscanf(noteID, "%d", &noteIDInt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid note id"})
		return
	}

	note, err := h.db.GetNoteByID(noteIDInt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	if note.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to update this note"})
		return
	}

	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	note.Title = req.Title
	note.Content = req.Content

	if err := h.db.UpdateNote(note); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, note)
}

func (h *NotesHandler) DeleteNote(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	noteID := c.Param("id")
	var noteIDInt int
	_, err := fmt.Sscanf(noteID, "%d", &noteIDInt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid note id"})
		return
	}

	note, err := h.db.GetNoteByID(noteIDInt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	if note.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to delete this note"})
		return
	}

	if err := h.db.DeleteNote(noteIDInt); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "note deleted successfully"})
}
