package handlers

import (
	"net/http"

	"backend/internal/model"

	"github.com/gin-gonic/gin"
)

type ApplyOpsRequest struct {
	Ops []model.Op `json:"ops"`
}

type OpsHandler struct {
	ops opsService
}

func NewOpsHandler(ops opsService) *OpsHandler {
	return &OpsHandler{ops: ops}
}

// ApplyOps godoc
// @Summary      Apply a batch of changes
// @Description  Applies up to 500 create, update, move, delete, trash and restore operations in order, all-or-nothing. restore takes a page out of the trash and puts it under parent_id at position, or at the end of the top level without parent_id; a page inside a trashed page cannot be restored on its own. A batch that moves pages to the trash also removes the user's pages that have been in the trash longer than the retention period. Ids are chosen by the client. position is an index into the parent's child_ids when the operation runs, not counting the item itself; without it the item goes at the end, except that a page added to the end of a page goes before its trailing empty paragraph. update merges props key by key: null values, and wrong values for keys the type relies on, are ignored. Rejected: unknown types, other users' items, items inside a trashed page, positions out of range, cycles, delete on a page, trash on a block, changing between page and block, a heading without a level, and props over 64 KB. A rejection names the failing operation in op_index.
// @Tags         items
// @Accept       json
// @Produce      json
// @Security     SessionCookie
// @Param        request  body  ApplyOpsRequest  true  "Operations to apply"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]any
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]any
// @Failure      409  {object}  map[string]any
// @Failure      413  {object}  map[string]any
// @Failure      500  {object}  map[string]string
// @Router       /ops [post]
func (h *OpsHandler) ApplyOps(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var req ApplyOpsRequest
	if !decode(c, &req) {
		return
	}
	if err := h.ops.ApplyOps(c.Request.Context(), userID, req.Ops); err != nil {
		writeError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// DuplicateItem godoc
// @Summary      Duplicate a page or block
// @Description  Deep-copies the item and everything under it, child pages included, with new ids, and places the copy right after the original. A copied page is named "Name (Copy N)". Copied pages are not favorites.
// @Tags         items
// @Produce      json
// @Security     SessionCookie
// @Param        id   path      string  true  "Page or block id"
// @Success      201  {object}  model.Item
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      409  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /items/{id}/duplicate [post]
func (h *OpsHandler) DuplicateItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := pathID(c)
	if !ok {
		return
	}
	copied, err := h.ops.Duplicate(c.Request.Context(), userID, id)
	if err != nil {
		writeError(c, err)
		return
	}
	c.JSON(http.StatusCreated, copied)
}
