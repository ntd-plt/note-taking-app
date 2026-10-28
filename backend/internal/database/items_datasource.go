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
	// GetPageTree returns a page and every block under it, stopping at child pages.
	GetPageTree(userID, pageID uuid.UUID) (model.PageTree, error)
	// Ancestors returns the pages above an item, top-level page first.
	Ancestors(userID, id uuid.UUID) ([]model.PageStub, error)
	// ListPages returns every page that is not in the trash (nor inside a trashed
	// page), in document order.
	ListPages(userID uuid.UUID) ([]model.PageSummary, error)
	// InsertItems inserts new items, parents before children, with their child_ids
	// already filled in. Items whose parent is not in the batch are appended, in
	// order, to that parent's child_ids.
	InsertItems(userID uuid.UUID, items []model.Item) error
}
