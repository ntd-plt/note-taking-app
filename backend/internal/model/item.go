package model

import (
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

type ItemType string

const (
	ItemTypeNote   ItemType = "note"
	ItemTypeFolder ItemType = "folder"
)

func (t ItemType) Valid() bool { return t == ItemTypeNote || t == ItemTypeFolder }

type Item struct {
	ID         uuid.UUID  `json:"id"`
	UserID     uuid.UUID  `json:"user_id"`
	ParentID   *uuid.UUID `json:"parent_id"`
	Type       ItemType   `json:"type"`
	Name       string     `json:"name"`
	Icon       string     `json:"icon"`
	IsFavorite bool       `json:"is_favorite"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type NoteContent struct {
	ItemID    uuid.UUID `json:"item_id"`
	Content   string    `json:"content"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ItemPatch struct {
	Name       *string
	Icon       *string
	IsFavorite *bool
}

type ItemMove struct {
	ID       uuid.UUID
	ParentID *uuid.UUID
}

type ItemFilter struct {
	ParentSet bool
	ParentID  *uuid.UUID
}

type ItemCopy struct {
	SourceID uuid.UUID
	NewID    uuid.UUID
	ParentID *uuid.UUID
	Type     ItemType
	Name     string
}

type DuplicatePlan struct {
	UserID uuid.UUID
	Copies []ItemCopy
}

func SortItems(items []Item) {
	sort.SliceStable(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if (a.Type == ItemTypeFolder) != (b.Type == ItemTypeFolder) {
			return a.Type == ItemTypeFolder
		}
		if la, lb := strings.ToLower(a.Name), strings.ToLower(b.Name); la != lb {
			return la < lb
		}
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.Before(b.CreatedAt)
		}
		return a.ID.String() < b.ID.String()
	})
}
