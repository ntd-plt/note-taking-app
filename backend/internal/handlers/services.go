package handlers

import (
	"context"

	"backend/internal/model"
	"backend/internal/services"

	"github.com/google/uuid"
)

// The service operations each handler needs.

type authService interface {
	Login(ctx context.Context, email, password string) (model.User, error)
	Signup(ctx context.Context, name, email, password string) (model.User, error)
}

type userService interface {
	Get(ctx context.Context, id uuid.UUID) (model.User, error)
	Rename(ctx context.Context, id uuid.UUID, name string) (model.User, error)
}

type pagesService interface {
	Open(ctx context.Context, userID, id uuid.UUID) (services.Opened, error)
	Workspace(ctx context.Context, userID uuid.UUID) (model.Item, error)
	Pages(ctx context.Context, userID uuid.UUID) ([]model.Item, error)
}

type opsService interface {
	ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error
	Duplicate(ctx context.Context, userID, id uuid.UUID) (model.Item, error)
}

type trashService interface {
	ListTrash(ctx context.Context, userID uuid.UUID) ([]services.TrashedPage, error)
	Restore(ctx context.Context, userID, id uuid.UUID) error
	DeleteFromTrash(ctx context.Context, userID, id uuid.UUID) error
	EmptyTrash(ctx context.Context, userID uuid.UUID) (int, error)
}
