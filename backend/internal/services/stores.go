package services

import (
	"context"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

// The storage each service needs, declared here, where it is used.

type UserStore interface {
	GetUserByEmail(ctx context.Context, email string) (model.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (model.User, error)
	AddUser(ctx context.Context, user model.User) error
	// UpdateUser saves the user and returns it as stored.
	UpdateUser(ctx context.Context, user model.User) (model.User, error)
}

type PageReader interface {
	GetWorkspace(ctx context.Context, userID uuid.UUID) (model.Item, error)
	OpenItem(ctx context.Context, userID, id uuid.UUID) (model.OpenedItem, error)
	ListPages(ctx context.Context, userID uuid.UUID) ([]model.Item, error)
}

type TreeWriter interface {
	ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error
	Duplicate(ctx context.Context, userID, id uuid.UUID) (model.Item, error)
}

type TrashStore interface {
	ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error
	ListTrash(ctx context.Context, userID uuid.UUID) ([]model.Item, error)
	DeleteFromTrash(ctx context.Context, userID, id uuid.UUID) error
	EmptyTrash(ctx context.Context, userID uuid.UUID, before *time.Time) (int, error)
}
