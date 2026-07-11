package handlers

import (
	"net/http"
	"time"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type FoldersHandler struct {
	db database.Database
}

type FolderResponse struct {
	ID             string       `json:"id"`
	ParentFolderID *uuid.UUID   `json:"parent_folder_id,omitempty"`
	Name           string       `json:"name"`
	UserID         string       `json:"user_id"`
	CreatedAt      string       `json:"created_at"`
	UpdatedAt      string       `json:"updated_at"`
	Children       []model.Item `json:"children,omitempty"`
}

type CreateFolderRequest struct {
	Name           string     `json:"name" binding:"required"`
	ParentFolderID *uuid.UUID `json:"parent_folder_id"`
	UserID         uuid.UUID  `json:"user_id" binding:"required"`
}

type UpdateFolderItem struct {
	ID             uuid.UUID  `json:"id" binding:"required"`
	Name           string     `json:"name"`
	ParentFolderID *uuid.UUID `json:"parent_folder_id"`
}

type UpdateFoldersRequest struct {
	Folders []UpdateFolderItem `json:"folders" binding:"required,min=1"`
}

type DeleteFoldersRequest struct {
	IDs []uuid.UUID `json:"ids" binding:"required,min=1"`
}

func NewFoldersHandler(db database.Database) *FoldersHandler {
	return &FoldersHandler{
		db: db,
	}
}

// CreateFolder godoc
// @Summary      Create a folder
// @Description  Creates a new folder, optionally nested inside a parent folder
// @Tags         folders
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      CreateFolderRequest  true  "Folder to create"
// @Success      201      {object}  model.Folder
// @Failure      400      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/folders [post]
func (h *FoldersHandler) CreateFolder(c *gin.Context) {
	var req CreateFolderRequest
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

// GetFolder godoc
// @Summary      Get a folder
// @Description  Returns a folder along with its direct child folders and notes
// @Tags         folders
// @Produce      json
// @Security     BearerAuth
// @Param        id   path      string  true  "Folder ID"
// @Success      200  {object}  FolderResponse
// @Failure      400  {object}  map[string]string
// @Failure      403  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /api/folders/{id} [get]
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

	folders, err := h.db.GetFoldersByIDs([]uuid.UUID{folderID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if len(folders) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "folder not found"})
		return
	}
	folder := folders[0]

	if folder.UserID != userID.(uuid.UUID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to access this folder"})
		return
	}

	children, err := h.db.GetFolderChildrenByID(folderID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, FolderResponse{
		ID:             folder.ID.String(),
		ParentFolderID: folder.ParentFolderID,
		Name:           folder.Name,
		UserID:         folder.UserID.String(),
		CreatedAt:      folder.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      folder.UpdatedAt.Format(time.RFC3339),
		Children:       children,
	})
}

// GetFolders godoc
// @Summary      List folders
// @Description  Returns all folders owned by the authenticated user
// @Tags         folders
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   model.Folder
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /api/folders [get]
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

// UpdateFolders godoc
// @Summary      Update multiple folders
// @Description  Updates the name and/or parent of one or more folders in a single batch
// @Tags         folders
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      UpdateFoldersRequest  true  "Folders to update"
// @Success      200      {array}   model.Folder
// @Failure      400      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/folders [put]
func (h *FoldersHandler) UpdateFolders(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req UpdateFoldersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ids := make([]uuid.UUID, len(req.Folders))
	for i, f := range req.Folders {
		ids[i] = f.ID
	}

	existingFolders, err := h.db.GetFoldersByIDs(ids)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	existingByID := make(map[uuid.UUID]model.Folder, len(existingFolders))
	for _, folder := range existingFolders {
		existingByID[folder.ID] = folder
	}

	folders := make([]model.Folder, 0, len(req.Folders))
	for _, f := range req.Folders {
		folder, ok := existingByID[f.ID]
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "folder not found", "id": f.ID})
			return
		}

		if folder.UserID != userID.(uuid.UUID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to update this folder", "id": f.ID})
			return
		}

		folder.Name = f.Name
		folder.ParentFolderID = f.ParentFolderID
		folders = append(folders, folder)
	}

	if err := h.db.UpdateFolders(folders); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, folders)
}

// DeleteFolders godoc
// @Summary      Delete multiple folders
// @Description  Deletes one or more folders owned by the authenticated user in a single batch
// @Tags         folders
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      DeleteFoldersRequest  true  "Folder IDs to delete"
// @Success      200      {object}  map[string]string
// @Failure      400      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/folders [delete]
func (h *FoldersHandler) DeleteFolders(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}

	var req DeleteFoldersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	existingFolders, err := h.db.GetFoldersByIDs(req.IDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	existingByID := make(map[uuid.UUID]model.Folder, len(existingFolders))
	for _, folder := range existingFolders {
		existingByID[folder.ID] = folder
	}

	for _, id := range req.IDs {
		folder, ok := existingByID[id]
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "folder not found", "id": id})
			return
		}

		if folder.UserID != userID.(uuid.UUID) {
			c.JSON(http.StatusForbidden, gin.H{"error": "not authorized to delete this folder", "id": id})
			return
		}
	}

	if err := h.db.DeleteFolders(req.IDs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "folders deleted successfully"})
}
