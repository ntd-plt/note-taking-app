// Package testutil provides in-memory fakes for the interfaces used across
// the backend, so handler and service tests can run without Postgres or a
// .env file.
package testutil

import (
	"backend/internal/apperr"
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"context"
	"errors"

	"github.com/google/uuid"
)

var (
	ErrUserNotFound error = apperr.NotFoundf("user")
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

func (f *FakeDatabase) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
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

func (f *FakeDatabase) GetUserByID(ctx context.Context, id uuid.UUID) (model.User, error) {
	if err := f.Errs["GetUserByID"]; err != nil {
		return model.User{}, err
	}
	u, ok := f.Users[id]
	if !ok {
		return model.User{}, ErrUserNotFound
	}
	return u, nil
}

func (f *FakeDatabase) AddUser(ctx context.Context, user model.User) error {
	if err := f.Errs["AddUser"]; err != nil {
		return err
	}
	f.Users[user.ID] = user
	f.addWorkspace(user.ID)
	return nil
}

func (f *FakeDatabase) UpdateUser(ctx context.Context, user model.User) error {
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
	// Compares counts calls to Compare, so tests can check that a path does the
	// same work as another.
	Compares int
}

var _ hash.Hasher = (*FakeHasher)(nil)

func (h *FakeHasher) Hash(password []byte) ([]byte, error) {
	if h.HashErr != nil {
		return nil, h.HashErr
	}
	return append([]byte("hashed:"), password...), nil
}

func (h *FakeHasher) Compare(hash, password []byte) error {
	h.Compares++
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
