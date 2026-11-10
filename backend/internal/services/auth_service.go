package services

import (
	"context"
	"log"
	"sync"

	"backend/internal/apperr"
	"backend/internal/model"
	"backend/internal/pkg/hash"
)

type AuthService struct {
	users          UserStore
	hasher         hash.Hasher
	emailValidator EmailValidator

	// dummyHash keeps a login with an unknown email as slow as one with a wrong
	// password, so timing doesn't reveal which accounts exist.
	dummyOnce sync.Once
	dummy     []byte
}

func NewAuthService(users UserStore, hasher hash.Hasher, emailValidator EmailValidator) *AuthService {
	return &AuthService{users: users, hasher: hasher, emailValidator: emailValidator}
}

// Login answers an unknown email and a wrong password alike, after the same work.
func (s *AuthService) Login(ctx context.Context, email, password string) (model.User, error) {
	u, err := s.users.GetUserByEmail(ctx, NormalizeEmail(email))
	if apperr.Is(err, apperr.NotFound) {
		_ = s.hasher.Compare(s.dummyHash(), []byte(password))
		return model.User{}, ErrWrongPasswordOrEmail
	}
	if err != nil {
		return model.User{}, err
	}
	if err := s.hasher.Compare(u.PasswordHash, []byte(password)); err != nil {
		return model.User{}, ErrWrongPasswordOrEmail
	}
	return u, nil
}

func (s *AuthService) Signup(ctx context.Context, rawName, rawEmail, password string) (model.User, error) {
	name, err := CheckName(rawName)
	if err != nil {
		return model.User{}, err
	}
	if err := CheckPassword(password); err != nil {
		return model.User{}, err
	}
	email, err := CheckEmailFormat(rawEmail)
	if err != nil {
		return model.User{}, err
	}

	_, err = s.users.GetUserByEmail(ctx, email)
	if err == nil {
		return model.User{}, ErrEmailAlreadyExists
	}
	if !apperr.Is(err, apperr.NotFound) {
		return model.User{}, err
	}
	if err := checkEmailDeliverable(ctx, s.emailValidator, email); err != nil {
		return model.User{}, err
	}

	passwordHash, err := s.hasher.Hash([]byte(password))
	if err != nil {
		return model.User{}, err
	}
	user := *model.New().WithEmail(email).WithPasswordHash(passwordHash).WithUsername(name)
	if err := s.users.AddUser(ctx, user); err != nil {
		if apperr.Is(err, apperr.Conflict) {
			return model.User{}, ErrEmailAlreadyExists
		}
		return model.User{}, err
	}
	return user, nil
}

func (s *AuthService) dummyHash() []byte {
	s.dummyOnce.Do(func() {
		h, err := s.hasher.Hash([]byte("not-a-real-password"))
		if err != nil {
			log.Printf("making the dummy password hash: %v", err)
			return
		}
		s.dummy = h
	})
	return s.dummy
}
