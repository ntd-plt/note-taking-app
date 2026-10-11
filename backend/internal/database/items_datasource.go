package database

import (
	"errors"

	"backend/internal/model"

	"github.com/google/uuid"
)

var (
	ErrMoveConflict  = errors.New("tree changed while moving")
	ErrInvalidParent = errors.New("parent must be one of your folders")
	ErrTooDeep       = errors.New("items are nested too deeply")
	ErrNotANote      = errors.New("item is not a note")
)

const MaxTreeDepth = 64

type ItemsDataSource interface {
	CreateItem(item model.Item, content string) (model.Item, error)
	GetItem(userID, id uuid.UUID) (model.Item, error)
	ListItems(userID uuid.UUID, filter model.ItemFilter) ([]model.Item, error)
	UpdateItem(userID, id uuid.UUID, patch model.ItemPatch) (model.Item, error)
	MoveItems(userID uuid.UUID, moves []model.ItemMove) ([]model.Item, error)
	DeleteItem(userID, id uuid.UUID) error
	ApplyDuplicate(plan model.DuplicatePlan) (model.Item, error)
	GetNoteContent(userID, id uuid.UUID) (model.NoteContent, error)
	PutNoteContent(userID, id uuid.UUID, content string) (model.NoteContent, error)
}
