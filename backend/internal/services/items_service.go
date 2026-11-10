package services

import (
	stderrors "errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"backend/internal/database"
	"backend/internal/middleware"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ItemsService struct {
	db database.ItemsDataSource
	// retention is how long a page stays in the trash before it is removed.
	retention time.Duration
	now       func() time.Time
}

func NewItemsService(db database.ItemsDataSource, trashRetention time.Duration) *ItemsService {
	return &ItemsService{db: db, retention: trashRetention, now: time.Now}
}

// ItemResponse is a page ready to open in the editor. Items is the page itself
// followed by everything under it in document order, each with its child_ids; child
// pages are included but not what is inside them. Ancestors are the pages above it,
// top-level first. FocusID is set when the requested id was a block, so the editor
// can scroll to it.
type ItemResponse struct {
	Items     []model.Item `json:"items"`
	Ancestors []model.Item `json:"ancestors"`
	FocusID   *uuid.UUID   `json:"focus_id"`
	InTrash   bool         `json:"in_trash"`
}

type RequestError struct {
	Status  int
	Message string
}

func (e *RequestError) Error() string { return e.Message }

func requestErr(status int, format string, args ...any) *RequestError {
	return &RequestError{Status: status, Message: fmt.Sprintf(format, args...)}
}

func isNotFound(err error) bool {
	var nf *pkg.NotFoundError
	return stderrors.As(err, &nf)
}

func respondError(c *gin.Context, err error) {
	var re *RequestError
	var exists *pkg.AlreadyExistsError
	switch {
	case stderrors.As(err, &re):
		c.JSON(re.Status, gin.H{"error": re.Message})
	case isNotFound(err):
		c.JSON(http.StatusNotFound, gin.H{"error": "item not found"})
	case stderrors.As(err, &exists):
		c.JSON(http.StatusConflict, gin.H{"error": "item already exists"})
	case stderrors.Is(err, database.ErrInvalidParent):
		c.JSON(http.StatusBadRequest, gin.H{"error": database.ErrInvalidParent.Error()})
	case stderrors.Is(err, database.ErrInvalidItem):
		log.Printf("schema check failed: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": database.ErrInvalidItem.Error()})
	default:
		log.Printf("internal error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

func currentUser(c *gin.Context) (uuid.UUID, bool) {
	userID, ok := middleware.UserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
		return uuid.Nil, false
	}
	return userID, true
}

func itemIDParam(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return uuid.Nil, false
	}
	return id, true
}

// GetItem godoc
// @Summary      Open a page or block
// @Description  For a page id, returns the page and everything under it as one flat list in document order (child pages included, not their content), plus its ancestor pages. For a block id, returns the page that contains the block, with focus_id set to the block. The workspace root cannot be opened.
// @Tags         items
// @Produce      json
// @Security     SessionCookie
// @Param        id   path      string  true  "Page or block id"
// @Success      200  {object}  ItemResponse
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /items/{id} [get]
func (s *ItemsService) GetItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}

	opened, err := s.db.OpenItem(c.Request.Context(), userID, id)
	if err != nil {
		respondError(c, err)
		return
	}

	resp := ItemResponse{Items: opened.Items, Ancestors: opened.Ancestors, InTrash: opened.Location.InTrash}
	if opened.Location.Type != model.ItemTypePage {
		resp.FocusID = &id
	}
	c.JSON(http.StatusOK, resp)
}

// GetWorkspace godoc
// @Summary      Get the workspace root
// @Description  Returns the user's hidden workspace item. Its child_ids are the top-level pages; create a top-level page with it as parent_id.
// @Tags         items
// @Produce      json
// @Security     SessionCookie
// @Success      200  {object}  model.Item
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /workspace [get]
func (s *ItemsService) GetWorkspace(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	ws, err := s.db.GetWorkspace(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, ws)
}

// ListPages godoc
// @Summary      List pages for the sidebar
// @Description  Returns every page that is not in the trash, in document order. parent_id is the direct parent (a block, a page or the workspace); parent_page_id is the nearest page above, left out for a top-level page.
// @Tags         items
// @Produce      json
// @Security     SessionCookie
// @Success      200  {array}   model.Item
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /pages [get]
func (s *ItemsService) ListPages(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	pages, err := s.db.ListPages(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, pages)
}
