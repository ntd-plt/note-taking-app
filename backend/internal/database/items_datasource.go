package database

import (
	"context"
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
	GetWorkspace(ctx context.Context, userID uuid.UUID) (model.Item, error)
	GetItem(ctx context.Context, userID, id uuid.UUID) (model.Item, error)
	OpenItem(ctx context.Context, userID, id uuid.UUID) (OpenedItem, error)
	ListPages(ctx context.Context, userID uuid.UUID) ([]model.Item, error)
	ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error
	Duplicate(ctx context.Context, userID, id uuid.UUID) (model.Item, error)
	// ListTrash returns the pages in the trash, most recently trashed first.
	ListTrash(ctx context.Context, userID uuid.UUID) ([]model.Item, error)
	// DeleteFromTrash removes a page in the trash, and everything in it, for good.
	DeleteFromTrash(ctx context.Context, userID, id uuid.UUID) error
	// EmptyTrash removes the pages trashed before `before` (all when nil) and
	// returns how many.
	EmptyTrash(ctx context.Context, userID uuid.UUID, before *time.Time) (int, error)
}
