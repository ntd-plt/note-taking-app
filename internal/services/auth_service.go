package services

import (
	"note-taking-app/internal/database"
	"note-taking-app/internal/errors"
	user "note-taking-app/internal/model"
	"note-taking-app/internal/pkg"
	"note-taking-app/internal/pkg/hash"
)

type AuthService struct {
	db           database.Database
	hasher       hash.Hasher
	tokenService TokenService
}

func NewAuthService(db database.Database, hasher hash.Hasher) *AuthService {
	return &AuthService{
		db:           db,
		hasher:       hasher,
		tokenService: NewJWTService(),
	}
}

func (s *AuthService) Login(email, password string) (*pkg.AuthResponse, error) {
	user, err := s.db.GetUserByEmail(email)
	if err != nil {
		return nil, err
	}
	if err := s.hasher.Compare([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.ErrWrongPasswordOrEmail
	}

	accessToken, err := s.tokenService.GenerateAccessToken(user.ID)
	if err != nil {
		return nil, err
	}

	refreshToken, err := s.tokenService.GenerateRefreshToken(user.ID)
	if err != nil {
		return nil, err
	}

	return pkg.NewAuthResponse(accessToken, refreshToken), nil
}

func (s *AuthService) Signup(name, email, password string) error {
	_, err := s.db.GetUserByEmail(email)
	if err == nil {
		return errors.ErrEmailAlreadyExists
	}

	passwordHash, err := s.hasher.Hash([]byte(password))
	s.db.CreateUser(*user.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name))
	return nil
}

func (s *AuthService) Logout() error {
	return nil
}

func (s *AuthService) RefreshToken(token string) (string, error) {
}
