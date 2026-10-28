package services

import (
	stderrors "errors"
	"fmt"
	"log"
	"net/http"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ItemsService struct {
	db database.ItemsDataSource
}

func NewItemsService(db database.ItemsDataSource) *ItemsService {
	return &ItemsService{db: db}
}

// ItemResponse is a page ready to open in the editor. Blocks are every block under
// the page in document order, each with its child_ids; the walk stops at child
// pages, which are listed in ChildPages with their name and icon only. Ancestors are
// the pages above it, top-level first. FocusID is set when the requested id was a
// block, so the editor can scroll to it.
type ItemResponse struct {
	Page       model.Item       `json:"page"`
	Ancestors  []model.PageStub `json:"ancestors"`
	Blocks     []model.Item     `json:"blocks"`
	ChildPages []model.PageStub `json:"child_pages"`
	FocusID    *uuid.UUID       `json:"focus_id"`
	InTrash    bool             `json:"in_trash"`
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
	default:
		log.Printf("internal error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
	}
}

func currentUser(c *gin.Context) (uuid.UUID, bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "user not authenticated"})
		return uuid.Nil, false
	}
	return userID.(uuid.UUID), true
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
// @Description  For a page id, returns the page, its ancestor pages, and every block under it down to its child pages. For a block id, returns the page that contains the block, with focus_id set to the block. The workspace root cannot be opened.
// @Tags         items
// @Produce      json
// @Security     BearerAuth
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

	loc, err := s.db.ResolveItem(userID, id)
	if err != nil {
		respondError(c, err)
		return
	}
	tree, err := s.db.GetPageTree(userID, loc.PageID)
	if err != nil {
		respondError(c, err)
		return
	}
	ancestors, err := s.db.Ancestors(userID, loc.PageID)
	if err != nil {
		respondError(c, err)
		return
	}

	resp := ItemResponse{
		Page:       tree.Page,
		Ancestors:  ancestors,
		Blocks:     tree.Blocks,
		ChildPages: tree.ChildPages,
		InTrash:    loc.InTrash,
	}
	if loc.Type != model.ItemTypePage {
		resp.FocusID = &id
	}
	c.JSON(http.StatusOK, resp)
}

// ListPages godoc
// @Summary      List pages for the sidebar
// @Description  Returns every page that is not in the trash, in document order. parent_id is the direct parent (a block, a page or the workspace); parent_page_id is the nearest page above, or null for a top-level page.
// @Tags         items
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   model.PageSummary
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /pages [get]
func (s *ItemsService) ListPages(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	pages, err := s.db.ListPages(userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, pages)
}
