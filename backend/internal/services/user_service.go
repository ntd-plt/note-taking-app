package services

import (
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

func (s *UserService) GetUserByEmail(email string) (model.User, error) {
	return s.db.GetUserByEmail(email)
}

func (s *UserService) GetUserByID(id uuid.UUID) (model.User, error) {
	return s.db.GetUserByID(id)
}

func (s *UserService) CreateUser(name, email string, passwordHash []byte) (model.User, error) {
	newUser := model.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name)
	if err := s.db.AddUser(*newUser); err != nil {
		return model.User{}, err
	}
	return *newUser, nil
}
