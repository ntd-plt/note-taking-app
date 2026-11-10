package handlers

import (
	"net/http"

	"backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

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

type PagesHandler struct {
	pages pagesService
}

func NewPagesHandler(pages pagesService) *PagesHandler {
	return &PagesHandler{pages: pages}
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
func (h *PagesHandler) GetItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c)
	if !ok {
		return
	}
	opened, err := h.pages.Open(c.Request.Context(), userID, id)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, ItemResponse{Items: opened.Items, Ancestors: opened.Ancestors, FocusID: opened.FocusID, InTrash: opened.InTrash})
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
func (h *PagesHandler) GetWorkspace(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	ws, err := h.pages.Workspace(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
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
func (h *PagesHandler) ListPages(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	pages, err := h.pages.Pages(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, pages)
}
