package database

import (
	"time"

	"backend/internal/model"
	"backend/internal/tree"

	"github.com/google/uuid"
)

const MaxTreeDepth = tree.MaxTreeDepth

type OpenedItem struct {
	Location  model.ItemLocation
	Items     []model.Item
	Ancestors []model.Item
}

type ItemsDataSource interface {
	GetWorkspace(userID uuid.UUID) (model.Item, error)
	GetItem(userID, id uuid.UUID) (model.Item, error)
	OpenItem(userID, id uuid.UUID) (OpenedItem, error)
	ListPages(userID uuid.UUID) ([]model.Item, error)
	ApplyOps(userID uuid.UUID, ops []model.Op) error
	Duplicate(userID, id uuid.UUID) (model.Item, error)
	// ListTrash returns the pages in the trash, most recently trashed first.
	ListTrash(userID uuid.UUID) ([]model.Item, error)
	// DeleteFromTrash removes a page in the trash, and everything in it, for good.
	DeleteFromTrash(userID, id uuid.UUID) error
	// EmptyTrash removes the pages trashed before `before` (all when nil) and
	// returns how many.
	EmptyTrash(userID uuid.UUID, before *time.Time) (int, error)
}
