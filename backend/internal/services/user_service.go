package services

import (
	"context"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/google/uuid"
)

type UserService struct {
	db database.UserDataSource
}

func NewUserService(db database.UserDataSource) *UserService {
	return &UserService{db: db}
}

func (s *UserService) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	return s.db.GetUserByEmail(ctx, email)
}

func (s *UserService) GetUserByID(ctx context.Context, id uuid.UUID) (model.User, error) {
	return s.db.GetUserByID(ctx, id)
}

func (s *UserService) CreateUser(ctx context.Context, name, email string, passwordHash []byte) (model.User, error) {
	newUser := model.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name)
	if err := s.db.AddUser(ctx, *newUser); err != nil {
		return model.User{}, err
	}
	return *newUser, nil
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
	if err := s.db.UpdateUser(ctx, user); err != nil {
		return model.User{}, err
	}
	return s.db.GetUserByID(ctx, id)
}
