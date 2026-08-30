package database

import (
	user "backend/internal/model"

	"github.com/google/uuid"
)

type UserDataSource interface {
	GetUserByEmail(email string) (user.User, error)
	GetUserByID(id uuid.UUID) (user.User, error)
	AddUser(user user.User) error
}
