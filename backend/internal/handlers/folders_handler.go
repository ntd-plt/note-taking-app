package handlers

import (
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/services"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FoldersHandler struct {
	db           database.Database
	tokenService *services.JWTService
}

func NewFoldersHandler(db database.Database, tokenService *services.JWTService) *FoldersHandler {
	return &FoldersHandler{
		db:           db,
		tokenService: tokenService,
	}
}

func (h *FoldersHandler) CreateFolder(c *gin.Context) {
	var req struct {
		Name           string     `json:"name" binding:"required"`
		ParentFolderID *uuid.UUID `json:"parent_folder_id"`
		UserID         uuid.UUID  `json:"user_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	folder := model.Folder{
		Name:           req.Name,
		ParentFolderID: req.ParentFolderID,
		UserID:         req.UserID,
	}

	createdFolder, err := h.db.CreateFolder(folder)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, createdFolder)
}

func (h *FoldersHandler) GetFolder(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	folderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid folder id"})
		return
	}

	folder, err := h.db.GetFolderByID(folderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}

	if folder.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to access this folder"})
		return
	}

	c.JSON(http.StatusOK, folder)
}

func (h *FoldersHandler) GetFolders(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	folders, err := h.db.GetFoldersByUserID(userID.(uuid.UUID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, folders)
}

func (h *FoldersHandler) UpdateFolder(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	folderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid folder id"})
		return
	}

	folder, err := h.db.GetFolderByID(folderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}

	if folder.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to update this folder"})
		return
	}

	var req struct {
		Name           string     `json:"name"`
		ParentFolderID *uuid.UUID `json:"parent_folder_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	folder.Name = req.Name
	folder.ParentFolderID = req.ParentFolderID

	if err := h.db.UpdateFolder(folder); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, folder)
}

func (h *FoldersHandler) DeleteFolder(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	folderID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid folder id"})
		return
	}

	folder, err := h.db.GetFolderByID(folderID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}

	if folder.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to delete this folder"})
		return
	}

	if err := h.db.DeleteFolder(folderID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "folder deleted successfully"})
}
