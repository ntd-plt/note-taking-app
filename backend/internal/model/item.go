package model

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ItemType is the kind of an item. Block types use BlockNote's names.
type ItemType string

const (
	ItemTypeWorkspace        ItemType = "workspace"
	ItemTypePage             ItemType = "page"
	ItemTypeParagraph        ItemType = "paragraph"
	ItemTypeHeading          ItemType = "heading"
	ItemTypeBulletListItem   ItemType = "bulletListItem"
	ItemTypeNumberedListItem ItemType = "numberedListItem"
	ItemTypeCheckListItem    ItemType = "checkListItem"
	ItemTypeToggleListItem   ItemType = "toggleListItem"
	ItemTypeQuote            ItemType = "quote"
)

// BlockTypes are the item types that are neither the workspace nor a page.
var BlockTypes = []ItemType{
	ItemTypeParagraph, ItemTypeHeading, ItemTypeBulletListItem, ItemTypeNumberedListItem,
	ItemTypeCheckListItem, ItemTypeToggleListItem, ItemTypeQuote,
}

func (t ItemType) IsBlock() bool {
	for _, b := range BlockTypes {
		if t == b {
			return true
		}
	}
	return false
}

func (t ItemType) Valid() bool {
	return t == ItemTypeWorkspace || t == ItemTypePage || t.IsBlock()
}

// Item is one node of a user's tree: the hidden workspace root, a page, or a block.
// ChildIDs lists the children that are not in the trash, in order. Name, Icon,
// IsFavorite and TrashedAt are only ever set on pages.
type Item struct {
	ID         uuid.UUID       `json:"id"`
	UserID     uuid.UUID       `json:"user_id"`
	ParentID   *uuid.UUID      `json:"parent_id"`
	Type       ItemType        `json:"type"`
	ChildIDs   []uuid.UUID     `json:"child_ids"`
	Props      json.RawMessage `json:"props" swaggertype:"object"`
	Content    json.RawMessage `json:"content" swaggertype:"array,object"`
	Name       *string         `json:"name,omitempty"`
	Icon       *string         `json:"icon,omitempty"`
	IsFavorite bool            `json:"is_favorite"`
	TrashedAt  *time.Time      `json:"trashed_at,omitempty"`
	CreatedAt  time.Time       `json:"created_at"`
	UpdatedAt  time.Time       `json:"updated_at"`
}

// ItemLocation is where an item lives: the page it belongs to (itself, for a page)
// and whether that page or any page above it is in the trash.
type ItemLocation struct {
	ID      uuid.UUID
	Type    ItemType
	PageID  uuid.UUID
	InTrash bool
}

// PageStub is a page seen from outside its own content: as a child page inside
// another page, or as a breadcrumb entry.
type PageStub struct {
	ID       uuid.UUID  `json:"id"`
	ParentID *uuid.UUID `json:"parent_id"`
	Name     string     `json:"name"`
	Icon     string     `json:"icon"`
}

// PageTree is a page and everything under it, down to (not into) its child pages.
// Blocks are in document order; child pages appear only in ChildPages.
type PageTree struct {
	Page       Item       `json:"page"`
	Blocks     []Item     `json:"blocks"`
	ChildPages []PageStub `json:"child_pages"`
}

// PageSummary is one row of the sidebar. ParentID is the direct parent, which may
// be a block or the workspace; ParentPageID is the nearest page above it, or nil for
// a top-level page.
type PageSummary struct {
	ID           uuid.UUID  `json:"id"`
	ParentID     uuid.UUID  `json:"parent_id"`
	ParentPageID *uuid.UUID `json:"parent_page_id"`
	Name         string     `json:"name"`
	Icon         string     `json:"icon"`
	IsFavorite   bool       `json:"is_favorite"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}
