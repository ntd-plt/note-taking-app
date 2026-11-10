package services

import (
	"context"
	"time"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/google/uuid"
)

type ItemsService struct {
	db database.ItemsDataSource
	// retention is how long a page stays in the trash before it is removed.
	retention time.Duration
	now       func() time.Time
}

func NewItemsService(db database.ItemsDataSource, trashRetention time.Duration) *ItemsService {
	return &ItemsService{db: db, retention: trashRetention, now: time.Now}
}

// Opened is a page ready for the editor. FocusID is set when the requested id was
// a block inside it.
type Opened struct {
	Items     []model.Item
	Ancestors []model.Item
	FocusID   *uuid.UUID
	InTrash   bool
}

func (s *ItemsService) Open(ctx context.Context, userID, id uuid.UUID) (Opened, error) {
	opened, err := s.db.OpenItem(ctx, userID, id)
	if err != nil {
		return Opened{}, err
	}
	out := Opened{Items: opened.Items, Ancestors: opened.Ancestors, InTrash: opened.Location.InTrash}
	if opened.Location.Type != model.ItemTypePage {
		out.FocusID = &id
	}
	return out, nil
}

func (s *ItemsService) Workspace(ctx context.Context, userID uuid.UUID) (model.Item, error) {
	return s.db.GetWorkspace(ctx, userID)
}

func (s *ItemsService) Pages(ctx context.Context, userID uuid.UUID) ([]model.Item, error) {
	return s.db.ListPages(ctx, userID)
}
