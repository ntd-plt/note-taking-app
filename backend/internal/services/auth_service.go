package services

import (
	"backend/internal/database"
	"backend/internal/errors"
	"backend/internal/pkg"
	"backend/internal/pkg/hash"
	"context"
	"fmt"

	user "backend/internal/model"
)

type AuthService struct {
	db             database.Database
	hasher         hash.Hasher
	tokenService   TokenService
	emailValidator EmailValidator
}

func NewAuthService(db database.Database, hasher hash.Hasher, tokenService TokenService, emailValidator EmailValidator) *AuthService {
	return &AuthService{
		db:             db,
		hasher:         hasher,
		tokenService:   tokenService,
		emailValidator: emailValidator,
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

func (s *AuthService) Signup(ctx context.Context, name, email, password string) error {
	_, err := s.db.GetUserByEmail(email)
	if err == nil {
		return errors.ErrEmailAlreadyExists
	}

	result, verifyErr := s.emailValidator.Verify(ctx, email)
	if verifyErr == nil && (result.Classification == EmailVerificationUndeliverable || result.IsDisposable) {
		return errors.ErrInvalidEmailAddress
	}

	passwordHash, err := s.hasher.Hash([]byte(password))
	if err != nil {
		fmt.Printf("error password hash")
		return err
	}

	newUser := user.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name)
	if err := s.db.AddUser(*newUser); err != nil {
		fmt.Printf("error adding user to db")
		return err
	}

	return nil
}

func (s *AuthService) Logout() error {
	return nil
}

func (s *AuthService) RefreshToken(token string) (string, error) {
	userID, err := s.tokenService.ValidateRefreshToken(token)
	if err != nil {
		return "", err
	}

	accessToken, err := s.tokenService.GenerateAccessToken(userID)
	if err != nil {
		return "", err
	}

	return accessToken, nil
}
