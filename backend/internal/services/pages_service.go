package services

import (
	"context"

	"backend/internal/model"

	"github.com/google/uuid"
)

type PagesService struct {
	db PageReader
}

func NewPagesService(db PageReader) *PagesService {
	return &PagesService{db: db}
}

// Opened is a page ready for the editor. FocusID is set when the requested id was
// a block inside it.
type Opened struct {
	Items     []model.Item
	Ancestors []model.Item
	FocusID   *uuid.UUID
	InTrash   bool
}

func (s *PagesService) Open(ctx context.Context, userID, id uuid.UUID) (Opened, error) {
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

func (s *PagesService) Workspace(ctx context.Context, userID uuid.UUID) (model.Item, error) {
	return s.db.GetWorkspace(ctx, userID)
}

func (s *PagesService) Pages(ctx context.Context, userID uuid.UUID) ([]model.Item, error) {
	return s.db.ListPages(ctx, userID)
}
