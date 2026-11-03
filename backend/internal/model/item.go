package model

import (
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

// Props are an item's key-value properties. Which keys matter depends on the
// type; see PropRules. Any other key is stored as given.
type Props map[string]any

// Item is one node of a user's tree: the hidden workspace root, a page, or a block.
// ChildIDs lists the children that are not in the trash, in order. TrashedAt is
// only ever set on pages. ParentPageID is not stored: it is filled in where a
// response needs it (the sidebar) and is the nearest page above the item.
type Item struct {
	ID           uuid.UUID   `json:"id"`
	UserID       uuid.UUID   `json:"user_id"`
	ParentID     *uuid.UUID  `json:"parent_id"`
	ParentPageID *uuid.UUID  `json:"parent_page_id,omitempty"`
	Type         ItemType    `json:"type"`
	ChildIDs     []uuid.UUID `json:"child_ids"`
	Props        Props       `json:"props"`
	TrashedAt    *time.Time  `json:"trashed_at,omitempty"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

// Name returns a page's name, or "" for any other item.
func (it Item) Name() string {
	s, _ := it.Props[PropName].(string)
	return s
}

// ItemLocation is where an item lives: the page it belongs to (itself, for a page)
// and whether that page or any page above it is in the trash.
type ItemLocation struct {
	Type    ItemType
	PageID  uuid.UUID
	InTrash bool
}

// OpType is what one operation in a batch does.
type OpType string

const (
	OpCreate OpType = "create"
	OpUpdate OpType = "update"
	OpMove   OpType = "move"
	OpDelete OpType = "delete"
	OpTrash  OpType = "trash"
)

type Op struct {
	Op       OpType     `json:"op" enums:"create,update,move,delete,trash"`
	ID       uuid.UUID  `json:"id"`
	Type     *ItemType  `json:"type,omitempty"`
	ParentID *uuid.UUID `json:"parent_id,omitempty"`
	Position *int       `json:"position,omitempty"`
	Props    Props      `json:"props,omitempty"`
}
