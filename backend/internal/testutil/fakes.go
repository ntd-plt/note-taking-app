// Package testutil provides in-memory fakes for the interfaces used across
// the backend, so handler and service tests can run without Postgres or a
// .env file.
package testutil

import (
	"backend/internal/apperr"
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

// FakeUserStore is an in-memory user table. Set a field of Fail to make that
// method fail. When linked to an item store, AddUser also creates the user's
// workspace, as Postgres does.
type FakeUserStore struct {
	Users map[uuid.UUID]model.User
	Fail  UserFailures
	items *FakeItemStore
}

type UserFailures struct {
	GetUserByEmail, GetUserByID, AddUser, UpdateUser error
}

var _ services.UserStore = (*FakeUserStore)(nil)

func NewFakeUserStore() *FakeUserStore {
	return &FakeUserStore{Users: map[uuid.UUID]model.User{}}
}

// NewFakeStores returns a user store and an item store linked like the real
// database: adding a user creates their workspace.
func NewFakeStores() (*FakeUserStore, *FakeItemStore) {
	items := NewFakeItemStore()
	users := NewFakeUserStore()
	users.items = items
	return users, items
}

func (f *FakeUserStore) GetUserByEmail(ctx context.Context, email string) (model.User, error) {
	if err := f.Fail.GetUserByEmail; err != nil {
		return model.User{}, err
	}
	for _, u := range f.Users {
		if u.Email == email {
			return u, nil
		}
	}
	return model.User{}, ErrUserNotFound
}

func (f *FakeUserStore) GetUserByID(ctx context.Context, id uuid.UUID) (model.User, error) {
	if err := f.Fail.GetUserByID; err != nil {
		return model.User{}, err
	}
	u, ok := f.Users[id]
	if !ok {
		return model.User{}, ErrUserNotFound
	}
	return u, nil
}

func (f *FakeUserStore) AddUser(ctx context.Context, user model.User) error {
	if err := f.Fail.AddUser; err != nil {
		return err
	}
	f.Users[user.ID] = user
	if f.items != nil {
		f.items.addWorkspace(user.ID)
	}
	return nil
}

func (f *FakeUserStore) UpdateUser(ctx context.Context, user model.User) error {
	if err := f.Fail.UpdateUser; err != nil {
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
