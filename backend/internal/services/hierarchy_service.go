package services

import (
	"errors"
	"net/http"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type HierarchyService struct {
	db database.HierarchyDataSource
}

type MoveItemsRequest struct {
	Items               []MoveItemRef `json:"items" binding:"required,min=1,dive"`
	DestinationFolderID *uuid.UUID    `json:"destination_folder_id"` // nil moves the items to the top level
}

type DuplicateItemsRequest struct {
	Items []MoveItemRef `json:"items" binding:"required,min=1,dive"`
}

type MovedItems struct {
	Folders []model.Folder `json:"folders"`
	Notes   []model.Note   `json:"notes"`
}

type MoveItemsResponse struct {
	Moved   MovedItems `json:"moved"`
	Created MovedItems `json:"created"`
}

func NewHierarchyService(db database.HierarchyDataSource) *HierarchyService {
	return &HierarchyService{db: db}
}

// MoveItems godoc
// @Summary      Move folders and notes
// @Description  Moves the selected folders and notes into a destination folder (or the top level when destination_folder_id is null). A selected item that sits inside another selected folder is cloned next to the moved parent instead, so the destination gains exactly one new direct entry per selected item. Clones are named "Name (Copy N)"; cloned folders are copied recursively. The whole request is applied atomically.
// @Tags         hierarchy
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      MoveItemsRequest  true  "Items to move and the destination"
// @Success      200      {object}  MoveItemsResponse
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/hierarchy/move [post]
func (h *HierarchyService) MoveItems(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}
	uid := userID.(uuid.UUID)

	var req MoveItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	probe := make([]uuid.UUID, 0, len(req.Items)+1)
	for _, it := range req.Items {
		probe = append(probe, it.ID)
	}
	if req.DestinationFolderID != nil {
		probe = append(probe, *req.DestinationFolderID)
	}

	snap, err := h.db.LoadHierarchy(uid, probe)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	plan, err := PlanMove(uid, snap, req.Items, req.DestinationFolderID, uuid.New)
	if err != nil {
		writeMoveError(c, err)
		return
	}

	h.respondApplied(c, plan)
}

// DuplicateItems godoc
// @Summary      Duplicate folders and notes
// @Description  Copies the selected folders and notes next to the originals, in the same parent. Copies are named "Name (Copy N)" with the smallest unused N, and a copied folder includes everything inside it. The whole request is applied atomically. The response lists the copies under "created"; "moved" is always empty.
// @Tags         hierarchy
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      DuplicateItemsRequest  true  "Items to duplicate"
// @Success      200      {object}  MoveItemsResponse
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      403      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /api/hierarchy/duplicate [post]
func (h *HierarchyService) DuplicateItems(c *gin.Context) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return
	}
	uid := userID.(uuid.UUID)

	var req DuplicateItemsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	probe := make([]uuid.UUID, 0, len(req.Items))
	for _, it := range req.Items {
		probe = append(probe, it.ID)
	}
	snap, err := h.db.LoadHierarchy(uid, probe)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	plan, err := PlanDuplicate(uid, snap, req.Items, uuid.New)
	if err != nil {
		writeMoveError(c, err)
		return
	}

	h.respondApplied(c, plan)
}

// respondApplied runs a plan and writes the shared move/duplicate response.
func (h *HierarchyService) respondApplied(c *gin.Context, plan model.MovePlan) {
	result, err := h.db.ApplyMove(plan)
	if err != nil {
		if errors.Is(err, database.ErrMoveConflict) {
			c.JSON(http.StatusConflict, gin.H{"error": "the hierarchy changed while applying; please retry"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, MoveItemsResponse{
		Moved:   MovedItems{Folders: nonNil(result.MovedFolders), Notes: nonNil(result.MovedNotes)},
		Created: MovedItems{Folders: nonNil(result.CreatedFolders), Notes: nonNil(result.CreatedNotes)},
	})
}

func writeMoveError(c *gin.Context, err error) {
	var me *MoveError
	if !errors.As(err, &me) {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	status := http.StatusBadRequest
	switch me.Kind {
	case MoveNotFound:
		status = http.StatusNotFound
	case MoveForbidden:
		status = http.StatusForbidden
	}
	body := gin.H{"error": me.Message}
	if me.ID != nil {
		body["id"] = *me.ID
	}
	c.JSON(status, body)
}

// nonNil keeps empty results as [] in the JSON instead of null.
func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
