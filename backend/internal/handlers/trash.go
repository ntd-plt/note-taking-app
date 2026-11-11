package handlers

import (
	"net/http"
	"time"

	"backend/internal/model"

	"github.com/gin-gonic/gin"
)

// TrashResponse lists the pages in the trash, most recently trashed first. Each
// page's purge_at is when it will be removed for good.
type TrashResponse struct {
	Pages []TrashedPage `json:"pages"`
}

type TrashedPage struct {
	model.Item
	PurgeAt string `json:"purge_at"`
}

type TrashHandler struct {
	trash trashService
}

func NewTrashHandler(trash trashService) *TrashHandler {
	return &TrashHandler{trash: trash}
}

// ListTrash godoc
// @Summary      List the trash
// @Description  Returns the pages in the trash, most recently trashed first. Pages inside a trashed page are not listed on their own. Pages past the retention period are left out; they are removed the next time something is moved to the trash.
// @Tags         trash
// @Produce      json
// @Security     SessionCookie
// @Success      200  {object}  TrashResponse
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash [get]
func (h *TrashHandler) ListTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	pages, err := h.trash.ListTrash(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}
	out := TrashResponse{Pages: []TrashedPage{}}
	for _, p := range pages {
		out.Pages = append(out.Pages, TrashedPage{Item: p.Page, PurgeAt: p.PurgeAt.UTC().Format(time.RFC3339)})
	}
	c.JSON(http.StatusOK, out)
}

// RestoreFromTrash godoc
// @Summary      Restore a page from the trash
// @Description  Puts the page back at the end of the top level, with everything that was inside it. To restore it somewhere else, send a restore operation to /ops. A page inside a trashed page cannot be restored on its own.
// @Tags         trash
// @Security     SessionCookie
// @Param        id   path  string  true  "Page id"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]any
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]any
// @Failure      409  {object}  map[string]any
// @Failure      500  {object}  map[string]string
// @Router       /trash/{id}/restore [post]
func (h *TrashHandler) RestoreFromTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.trash.Restore(c.Request.Context(), userID, id); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// DeleteFromTrash godoc
// @Summary      Delete a page for good
// @Description  Removes a page in the trash and everything inside it. This cannot be undone.
// @Tags         trash
// @Security     SessionCookie
// @Param        id   path  string  true  "Page id"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash/{id} [delete]
func (h *TrashHandler) DeleteFromTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c)
	if !ok {
		return
	}
	if err := h.trash.DeleteFromTrash(c.Request.Context(), userID, id); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// EmptyTrash godoc
// @Summary      Empty the trash
// @Description  Removes every page in the trash, and everything inside them, for good.
// @Tags         trash
// @Produce      json
// @Security     SessionCookie
// @Success      200  {object}  map[string]int  "deleted: how many pages were removed"
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash [delete]
func (h *TrashHandler) EmptyTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	n, err := h.trash.EmptyTrash(c.Request.Context(), userID)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}
