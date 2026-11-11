package database_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"errors"
	"testing"
	"time"

	"backend/internal/database"
	"backend/internal/session"

	"github.com/google/uuid"
)

func newSessionStore(t *testing.T) (*database.PostgreSessionStore, uuid.UUID) {
	t.Helper()
	_, pool := newItemsDB(t)
	return database.NewPostgreSessionStore(pool), newUser(t, pool)
}

func randomHash() []byte {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return b
}

func newSession(user uuid.UUID, now time.Time, idle, absolute time.Duration) session.Session {
	return session.Session{
		IDHash: randomHash(), UserID: user, CreatedAt: now, LastSeenAt: now,
		IdleExpiresAt: now.Add(idle), AbsoluteExpiresAt: now.Add(absolute), UserAgent: "Firefox",
	}
}

func TestPostgresSessionStoreRoundTrip(t *testing.T) {
	store, user := newSessionStore(t)
	ctx := context.Background()
	now := time.Now().UTC().Truncate(time.Microsecond)
	s := newSession(user, now, time.Hour, 24*time.Hour)

	if err := store.Insert(ctx, s); err != nil {
		t.Fatal(err)
	}
	got, err := store.Get(ctx, s.IDHash)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got.IDHash, s.IDHash) || got.UserID != user || got.UserAgent != "Firefox" ||
		!got.IdleExpiresAt.Equal(s.IdleExpiresAt) || !got.AbsoluteExpiresAt.Equal(s.AbsoluteExpiresAt) {
		t.Errorf("got %+v, want %+v", got, s)
	}

	later := now.Add(10 * time.Minute)
	if err := store.Touch(ctx, s.IDHash, later, later.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	got, _ = store.Get(ctx, s.IDHash)
	if !got.LastSeenAt.Equal(later) || !got.IdleExpiresAt.Equal(later.Add(time.Hour)) {
		t.Errorf("after touch: last seen %v, idle %v", got.LastSeenAt, got.IdleExpiresAt)
	}

	if err := store.Delete(ctx, s.IDHash); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, s.IDHash); !errors.Is(err, session.ErrNotFound) {
		t.Errorf("after delete: err = %v, want ErrNotFound", err)
	}
}

func TestPostgresSessionStoreDeletesByUserAndExpiry(t *testing.T) {
	store, user := newSessionStore(t)
	ctx := context.Background()
	now := time.Now().UTC()

	live := newSession(user, now, time.Hour, 24*time.Hour)
	idle := newSession(user, now.Add(-2*time.Hour), time.Hour, 24*time.Hour)
	absolute := newSession(user, now.Add(-48*time.Hour), 72*time.Hour, 24*time.Hour)
	for _, s := range []session.Session{live, idle, absolute} {
		if err := store.Insert(ctx, s); err != nil {
			t.Fatal(err)
		}
	}

	if err := store.DeleteExpired(ctx, user, now); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, live.IDHash); err != nil {
		t.Errorf("live session: %v", err)
	}
	for name, s := range map[string]session.Session{"idle": idle, "absolute": absolute} {
		if _, err := store.Get(ctx, s.IDHash); !errors.Is(err, session.ErrNotFound) {
			t.Errorf("%s-expired session: err = %v, want ErrNotFound", name, err)
		}
	}

	if err := store.DeleteAllForUser(ctx, user); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, live.IDHash); !errors.Is(err, session.ErrNotFound) {
		t.Errorf("after delete-all: err = %v, want ErrNotFound", err)
	}
}

func TestPostgresSessionsGoWithTheirUser(t *testing.T) {
	_, pool := newItemsDB(t)
	store := database.NewPostgreSessionStore(pool)
	user := newUser(t, pool)
	ctx := context.Background()
	s := newSession(user, time.Now(), time.Hour, 24*time.Hour)
	if err := store.Insert(ctx, s); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "DELETE FROM users WHERE id = $1", user); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Get(ctx, s.IDHash); !errors.Is(err, session.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound once the user is deleted", err)
	}
}
