package testutil

import (
	"context"
	"sync"
	"time"

	"backend/internal/session"

	"github.com/google/uuid"
)

// FakeSessionStore is an in-memory session.Store. Set Err to make every method fail.
type FakeSessionStore struct {
	mu       sync.Mutex
	Sessions map[string]session.Session
	Err      error
}

var _ session.Store = (*FakeSessionStore)(nil)

func NewFakeSessionStore() *FakeSessionStore {
	return &FakeSessionStore{Sessions: map[string]session.Session{}}
}

func (f *FakeSessionStore) Insert(_ context.Context, s session.Session) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	f.Sessions[string(s.IDHash)] = s
	return nil
}

func (f *FakeSessionStore) Get(_ context.Context, idHash []byte) (session.Session, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return session.Session{}, f.Err
	}
	s, ok := f.Sessions[string(idHash)]
	if !ok {
		return session.Session{}, session.ErrNotFound
	}
	return s, nil
}

func (f *FakeSessionStore) Touch(_ context.Context, idHash []byte, lastSeen, idleExpires time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	if s, ok := f.Sessions[string(idHash)]; ok {
		s.LastSeenAt, s.IdleExpiresAt = lastSeen, idleExpires
		f.Sessions[string(idHash)] = s
	}
	return nil
}

func (f *FakeSessionStore) Delete(_ context.Context, idHash []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	delete(f.Sessions, string(idHash))
	return nil
}

func (f *FakeSessionStore) DeleteAllForUser(_ context.Context, userID uuid.UUID) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	for k, s := range f.Sessions {
		if s.UserID == userID {
			delete(f.Sessions, k)
		}
	}
	return nil
}

func (f *FakeSessionStore) DeleteExpired(_ context.Context, userID uuid.UUID, now time.Time) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.Err != nil {
		return f.Err
	}
	for k, s := range f.Sessions {
		if s.UserID == userID && (!now.Before(s.IdleExpiresAt) || !now.Before(s.AbsoluteExpiresAt)) {
			delete(f.Sessions, k)
		}
	}
	return nil
}

// ForUser returns the user's sessions, in no particular order.
func (f *FakeSessionStore) ForUser(userID uuid.UUID) []session.Session {
	f.mu.Lock()
	defer f.mu.Unlock()
	var out []session.Session
	for _, s := range f.Sessions {
		if s.UserID == userID {
			out = append(out, s)
		}
	}
	return out
}
