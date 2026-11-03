package database

import (
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
}
