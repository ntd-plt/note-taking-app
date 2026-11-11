package services

import (
	"context"

	"backend/internal/model"

	"github.com/google/uuid"
)

type UserService struct {
	db UserStore
}

func NewUserService(db UserStore) *UserService {
	return &UserService{db: db}
}

func (s *UserService) Get(ctx context.Context, id uuid.UUID) (model.User, error) {
	return s.db.GetUserByID(ctx, id)
}

// Rename sets the user's name and returns the user as stored.
func (s *UserService) Rename(ctx context.Context, id uuid.UUID, rawName string) (model.User, error) {
	name, err := CheckName(rawName)
	if err != nil {
		return model.User{}, err
	}
	user, err := s.db.GetUserByID(ctx, id)
	if err != nil {
		return model.User{}, err
	}
	user.Name = name
	return s.db.UpdateUser(ctx, user)
}
