package database

import (
	"backend/internal/model"

	"github.com/google/uuid"
)

// MaxTreeDepth bounds every walk up or down the item tree.
const MaxTreeDepth = 256

type ItemsDataSource interface {
	GetWorkspace(userID uuid.UUID) (model.Item, error)
	GetItem(userID, id uuid.UUID) (model.Item, error)
	// ResolveItem finds the page an item belongs to: the item itself when it is a
	// page, otherwise the nearest page above it. The workspace has no page.
	ResolveItem(userID, id uuid.UUID) (model.ItemLocation, error)
	// GetPageTree returns a page followed by everything under it in document
	// order. Child pages are included, but not what is inside them.
	GetPageTree(userID, pageID uuid.UUID) ([]model.Item, error)
	// Ancestors returns the pages above an item, top-level page first.
	Ancestors(userID, id uuid.UUID) ([]model.Item, error)
	// ListPages returns every page that is not in the trash (nor inside a trashed
	// page), in document order, with ParentPageID filled in.
	ListPages(userID uuid.UUID) ([]model.Item, error)
	// InsertItems inserts new items, parents before children, with their child_ids
	// already filled in. Items whose parent is not in the batch are appended, in
	// order, to that parent's child_ids.
	InsertItems(userID uuid.UUID, items []model.Item) error
}
