package services

import (
	"encoding/json"
	stderrors "errors"
	"net/http"

	"backend/internal/model"
	"backend/internal/tree"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const MaxOpsPerBatch = 500

type ApplyOpsRequest struct {
	Ops []model.Op `json:"ops"`
}

// opError is an operation rejected before the batch runs; Index is its position
// in the batch.
type opError struct {
	Index   int
	Status  int
	Message string
}

func (e *opError) Error() string { return e.Message }

func badOp(i int, msg string) *opError {
	return &opError{Index: i, Status: http.StatusBadRequest, Message: msg}
}

func decodeBody(c *gin.Context, dst any) *RequestError {
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooBig *http.MaxBytesError
		if stderrors.As(err, &tooBig) {
			return requestErr(http.StatusRequestEntityTooLarge, "request body is too large")
		}
		return requestErr(http.StatusBadRequest, "invalid request body: %s", err.Error())
	}
	if dec.More() {
		return requestErr(http.StatusBadRequest, "invalid request body: unexpected data after the JSON value")
	}
	return nil
}

// validateOp checks one operation on its own, without looking at the tree. The
// tree rules, and the props each type needs, are checked when the batch runs.
func validateOp(i int, op model.Op) *opError {
	if op.ID == uuid.Nil {
		return badOp(i, "id is required")
	}
	if op.Type != nil && (*op.Type == model.ItemTypeWorkspace || !op.Type.Valid()) {
		return badOp(i, "unknown type "+string(*op.Type))
	}
	if op.Position != nil && *op.Position < 0 {
		return badOp(i, "position cannot be negative")
	}
	if op.Props != nil {
		raw, err := json.Marshal(op.Props)
		if err != nil {
			return badOp(i, "props cannot be stored")
		}
		if len(raw) > tree.MaxPropsBytes {
			return &opError{Index: i, Status: http.StatusRequestEntityTooLarge, Message: "props must be at most 64 KB"}
		}
	}
	placed := op.ParentID != nil || op.Position != nil

	switch op.Op {
	case model.OpCreate:
		if op.Type == nil || op.ParentID == nil {
			return badOp(i, "create needs type and parent_id")
		}
	case model.OpUpdate:
		if placed {
			return badOp(i, "use move to change where an item is")
		}
		if op.Type == nil && op.Props == nil {
			return badOp(i, "update needs type or props")
		}
	case model.OpMove:
		if op.ParentID == nil {
			return badOp(i, "move needs parent_id")
		}
		if op.Type != nil || op.Props != nil {
			return badOp(i, "move only changes where an item is")
		}
	case model.OpDelete, model.OpTrash:
		if op.Type != nil || op.Props != nil || placed {
			return badOp(i, string(op.Op)+" takes only an id")
		}
	case model.OpRestore:
		if op.Type != nil || op.Props != nil {
			return badOp(i, "restore only takes an id, parent_id and position")
		}
	default:
		return badOp(i, "op must be one of create, update, move, delete, trash, restore")
	}
	return nil
}

var treeStatus = map[tree.Kind]int{
	tree.Invalid:  http.StatusBadRequest,
	tree.NotFound: http.StatusNotFound,
	tree.Conflict: http.StatusConflict,
}

func respondOpError(c *gin.Context, err error) {
	var oe *opError
	var te *tree.Error
	switch {
	case stderrors.As(err, &oe):
		c.JSON(oe.Status, gin.H{"error": oe.Message, "op_index": oe.Index})
	case stderrors.As(err, &te):
		c.JSON(treeStatus[te.Kind], gin.H{"error": te.Msg, "op_index": te.Index})
	default:
		respondError(c, err)
	}
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
func (s *ItemsService) ApplyOps(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var req ApplyOpsRequest
	if err := decodeBody(c, &req); err != nil {
		respondError(c, err)
		return
	}
	if len(req.Ops) == 0 {
		respondError(c, requestErr(http.StatusBadRequest, "ops must not be empty"))
		return
	}
	if len(req.Ops) > MaxOpsPerBatch {
		respondError(c, requestErr(http.StatusRequestEntityTooLarge, "at most %d operations per batch", MaxOpsPerBatch))
		return
	}
	for i, op := range req.Ops {
		if err := validateOp(i, op); err != nil {
			respondOpError(c, err)
			return
		}
	}
	if err := s.db.ApplyOps(userID, req.Ops); err != nil {
		respondOpError(c, err)
		return
	}
	if movesToTrash(req.Ops) {
		s.purgeExpiredTrash(userID)
	}
	c.Status(http.StatusNoContent)
}

// movesToTrash reports whether a batch can put pages in the trash: trash does,
// and so does delete when the deleted block holds pages.
func movesToTrash(ops []model.Op) bool {
	for _, op := range ops {
		if op.Op == model.OpTrash || op.Op == model.OpDelete {
			return true
		}
	}
	return false
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
func (s *ItemsService) DuplicateItem(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	copied, err := s.db.Duplicate(userID, id)
	var te *tree.Error
	if stderrors.As(err, &te) {
		c.JSON(treeStatus[te.Kind], gin.H{"error": te.Msg})
		return
	}
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, copied)
}
