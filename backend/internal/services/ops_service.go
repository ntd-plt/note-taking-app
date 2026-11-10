package services

import (
	"context"
	"encoding/json"

	"backend/internal/apperr"
	"backend/internal/model"
	"backend/internal/tree"

	"github.com/google/uuid"
)

const MaxOpsPerBatch = 500

func badOp(i int, msg string) *apperr.Error {
	return apperr.New(apperr.Invalid, "%s", msg).AtOp(i)
}

// validateOp checks one operation on its own, without looking at the tree. The
// tree rules, and the props each type needs, are checked when the batch runs.
func validateOp(i int, op model.Op) error {
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
			return apperr.New(apperr.TooLarge, "props must be at most 64 KB").AtOp(i)
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

// ApplyOps checks each operation on its own, runs the batch all-or-nothing, and
// purges expired trash after a batch that can move pages to the trash.
func (s *ItemsService) ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error {
	if len(ops) == 0 {
		return apperr.New(apperr.Invalid, "ops must not be empty")
	}
	if len(ops) > MaxOpsPerBatch {
		return apperr.New(apperr.TooLarge, "at most %d operations per batch", MaxOpsPerBatch)
	}
	for i, op := range ops {
		if err := validateOp(i, op); err != nil {
			return err
		}
	}
	if err := s.db.ApplyOps(ctx, userID, ops); err != nil {
		return err
	}
	if movesToTrash(ops) {
		s.purgeExpiredTrash(ctx, userID)
	}
	return nil
}

func (s *ItemsService) Duplicate(ctx context.Context, userID, id uuid.UUID) (model.Item, error) {
	return s.db.Duplicate(ctx, userID, id)
}
