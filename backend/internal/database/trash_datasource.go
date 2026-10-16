package database

import (
	"errors"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

// MaxTrashRows caps how many rows (items plus everything inside them) one trash or
// restore request may move.
const MaxTrashRows = 1000

var ErrTrashTooLarge = errors.New("too many items to move at once")

// TrashDataSource moves items between the live tree and the trash. A cutoff is the
// oldest deleted_at still inside the retention period: older rows are treated as gone
// even if the purge has not removed them yet.
type TrashDataSource interface {
	// TrashItems moves the items and everything inside them to the trash as one batch
	// stamped trashedAt, and returns every row that moved.
	TrashItems(userID uuid.UUID, ids []uuid.UUID, trashedAt time.Time) ([]model.TrashItem, error)
	ListTrash(userID uuid.UUID, cutoff time.Time) ([]model.TrashItem, error)
	// RestoreItems puts the items, and the descendants trashed in the same batch, back
	// in the tree. An item whose original parent is not live (or restored in the same
	// call) goes to the top level.
	RestoreItems(userID uuid.UUID, ids []uuid.UUID, cutoff time.Time) ([]model.Item, error)
	// DeleteTrashed permanently deletes one trashed item and the trashed items inside it.
	DeleteTrashed(userID, id uuid.UUID, cutoff time.Time) error
	EmptyTrash(userID uuid.UUID) error
	PurgeExpired(cutoff time.Time) (int64, error)
}
