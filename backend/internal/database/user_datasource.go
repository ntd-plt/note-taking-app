package database

import (
	user "backend/internal/model"
	"context"

	"github.com/google/uuid"
)

type UserDataSource interface {
	GetUserByEmail(ctx context.Context, email string) (user.User, error)
	GetUserByID(ctx context.Context, id uuid.UUID) (user.User, error)
	AddUser(ctx context.Context, user user.User) error
	UpdateUser(ctx context.Context, user user.User) error
}
