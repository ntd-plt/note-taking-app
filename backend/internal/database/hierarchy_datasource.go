package database

import (
	"errors"

	user "backend/internal/model"

	"github.com/google/uuid"
)

// ErrMoveConflict means the data changed underneath a move so it could not be applied
// (a source row vanished, or the destination now sits inside a moved folder).
var ErrMoveConflict = errors.New("hierarchy changed while moving")

type HierarchyDataSource interface {
	// LoadHierarchy returns every folder and note owned by userID. probeIDs that
	// exist but belong to another user are reported in the snapshot's Foreign set.
	LoadHierarchy(userID uuid.UUID, probeIDs []uuid.UUID) (user.HierarchySnapshot, error)
	// ApplyMove performs the whole plan atomically: all of it is applied, or none.
	ApplyMove(plan user.MovePlan) (user.MoveResult, error)
}
