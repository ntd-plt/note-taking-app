// Package testutil provides in-memory fakes for the interfaces used across
// the backend, so handler and service tests can run without Postgres or a
// .env file.
package testutil

import (
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	// ErrUserNotFound is a *pkg.NotFoundError so tests using errors.As
	// against that type see the fake behave the same way the real Postgres
	// datasource does.
	ErrUserNotFound error = pkg.NewNotFoundError("user")
)

// Set Errs["MethodName"] to force that method to fail.
type FakeDatabase struct {
	Users map[uuid.UUID]model.User
	Items map[uuid.UUID]model.Item
	Errs  map[string]error
}

var (
	_ database.UserDataSource  = (*FakeDatabase)(nil)
	_ database.ItemsDataSource = (*FakeDatabase)(nil)
)

func NewFakeDatabase() *FakeDatabase {
	return &FakeDatabase{
		Users: make(map[uuid.UUID]model.User),
		Items: make(map[uuid.UUID]model.Item),
		Errs:  make(map[string]error),
	}
}

func (f *FakeDatabase) Connect() error    { return f.Errs["Connect"] }
func (f *FakeDatabase) Disconnect() error { return f.Errs["Disconnect"] }

func (f *FakeDatabase) GetUserByEmail(email string) (model.User, error) {
	if err := f.Errs["GetUserByEmail"]; err != nil {
		return model.User{}, err
	}
	for _, u := range f.Users {
		if u.Email == email {
			return u, nil
		}
	}
	return model.User{}, ErrUserNotFound
}

func (f *FakeDatabase) GetUserByID(id uuid.UUID) (model.User, error) {
	if err := f.Errs["GetUserByID"]; err != nil {
		return model.User{}, err
	}
	u, ok := f.Users[id]
	if !ok {
		return model.User{}, ErrUserNotFound
	}
	return u, nil
}

func (f *FakeDatabase) AddUser(user model.User) error {
	if err := f.Errs["AddUser"]; err != nil {
		return err
	}
	f.Users[user.ID] = user
	f.addWorkspace(user.ID)
	return nil
}

func (f *FakeDatabase) UpdateUser(user model.User) error {
	if err := f.Errs["UpdateUser"]; err != nil {
		return err
	}
	if _, ok := f.Users[user.ID]; !ok {
		return ErrUserNotFound
	}
	f.Users[user.ID] = user
	return nil
}

// FakeHasher is a trivial hash.Hasher: Hash prefixes the password with
// "hashed:", Compare checks that prefix. Deterministic and fast.
type FakeHasher struct {
	HashErr error
}

var _ hash.Hasher = (*FakeHasher)(nil)

func (h *FakeHasher) Hash(password []byte) ([]byte, error) {
	if h.HashErr != nil {
		return nil, h.HashErr
	}
	return append([]byte("hashed:"), password...), nil
}

func (h *FakeHasher) Compare(hash, password []byte) error {
	if string(hash) != "hashed:"+string(password) {
		return errors.New("hash mismatch")
	}
	return nil
}

// FakeEmailValidator is a services.EmailValidator returning a fixed
// Classification/IsDisposable pair, or Err if set (simulating a failed
// verification call so callers can exercise the fail-open path). The zero
// value classifies every email as allowed.
type FakeEmailValidator struct {
	Classification services.EmailVerificationClassification
	IsDisposable   bool
	Err            error
}

var _ services.EmailValidator = (*FakeEmailValidator)(nil)

func (f *FakeEmailValidator) Verify(ctx context.Context, email string) (services.EmailVerificationResult, error) {
	if f.Err != nil {
		return services.EmailVerificationResult{}, f.Err
	}
	return services.EmailVerificationResult{
		Classification: f.Classification,
		IsDisposable:   f.IsDisposable,
	}, nil
}

// FakeTokenService is a services.TokenService that issues predictable tokens
// ("access-token" / "refresh-token") and validates only the tokens it issued,
// resolving them to ValidUserID.
type FakeTokenService struct {
	ValidUserID uuid.UUID

	GenerateAccessErr  error
	GenerateRefreshErr error
	ValidateErr        error
}

var _ services.TokenService = (*FakeTokenService)(nil)

func (s *FakeTokenService) GenerateAccessToken(userID uuid.UUID) (string, error) {
	if s.GenerateAccessErr != nil {
		return "", s.GenerateAccessErr
	}
	return "access-token", nil
}

func (s *FakeTokenService) GenerateRefreshToken(userID uuid.UUID) (string, error) {
	if s.GenerateRefreshErr != nil {
		return "", s.GenerateRefreshErr
	}
	return "refresh-token", nil
}

func (s *FakeTokenService) ValidateAccessToken(tokenString string) (uuid.UUID, error) {
	if s.ValidateErr != nil {
		return uuid.Nil, s.ValidateErr
	}
	if tokenString != "access-token" {
		return uuid.Nil, errors.New("invalid token")
	}
	return s.ValidUserID, nil
}

func (s *FakeTokenService) ValidateRefreshToken(tokenString string) (uuid.UUID, error) {
	if s.ValidateErr != nil {
		return uuid.Nil, s.ValidateErr
	}
	if tokenString != "refresh-token" {
		return uuid.Nil, errors.New("invalid token")
	}
	return s.ValidUserID, nil
}
