package session_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"backend/internal/session"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

var cfg = session.Config{IdleTTL: 7 * 24 * time.Hour, AbsoluteTTL: 30 * 24 * time.Hour}

// clock is a settable time source.
type clock struct{ t time.Time }

func (c *clock) now() time.Time          { return c.t }
func (c *clock) advance(d time.Duration) { c.t = c.t.Add(d) }
func newClock() *clock                   { return &clock{t: time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)} }
func setup() (*session.Service, *testutil.FakeSessionStore, *clock) {
	store := testutil.NewFakeSessionStore()
	c := newClock()
	return session.NewService(store, cfg).WithClock(c.now), store, c
}

var ctx = context.Background()

func TestCreateStoresOnlyAHashAndSetsExpiries(t *testing.T) {
	svc, store, c := setup()
	user := uuid.New()

	id, sess, err := svc.Create(ctx, user, "Firefox")
	if err != nil {
		t.Fatal(err)
	}
	if len(id) != 43 { // 32 bytes, base64url without padding
		t.Errorf("id %q has length %d, want 43", id, len(id))
	}
	if len(store.Sessions) != 1 {
		t.Fatalf("stored %d sessions, want 1", len(store.Sessions))
	}
	for key := range store.Sessions {
		if key == id || strings.Contains(key, id) {
			t.Error("the raw id was stored")
		}
	}
	if sess.UserID != user || sess.UserAgent != "Firefox" {
		t.Errorf("session = %+v", sess)
	}
	if want := c.t.Add(cfg.IdleTTL); !sess.IdleExpiresAt.Equal(want) {
		t.Errorf("idle expiry = %v, want %v", sess.IdleExpiresAt, want)
	}
	if want := c.t.Add(cfg.AbsoluteTTL); !sess.AbsoluteExpiresAt.Equal(want) {
		t.Errorf("absolute expiry = %v, want %v", sess.AbsoluteExpiresAt, want)
	}
}

func TestCreateGivesEachLoginItsOwnID(t *testing.T) {
	svc, _, _ := setup()
	a, _, _ := svc.Create(ctx, uuid.New(), "")
	b, _, _ := svc.Create(ctx, uuid.New(), "")
	if a == b {
		t.Error("two logins got the same session id")
	}
}

func TestCreateTruncatesALongUserAgent(t *testing.T) {
	svc, _, _ := setup()
	_, sess, err := svc.Create(ctx, uuid.New(), strings.Repeat("é", 600))
	if err != nil {
		t.Fatal(err)
	}
	if n := len([]rune(sess.UserAgent)); n != 512 {
		t.Errorf("user agent has %d runes, want 512", n)
	}
}

func TestLookupFindsALiveSession(t *testing.T) {
	svc, _, _ := setup()
	user := uuid.New()
	id, _, _ := svc.Create(ctx, user, "")

	sess, err := svc.Lookup(ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	if sess.UserID != user {
		t.Errorf("user = %v, want %v", sess.UserID, user)
	}
}

func TestLookupRejectsUnknownAndMalformedIDs(t *testing.T) {
	svc, _, _ := setup()
	for _, id := range []string{"", "not base64!", "c2hvcnQ", strings.Repeat("A", 43)} {
		if _, err := svc.Lookup(ctx, id); !errors.Is(err, session.ErrNotFound) {
			t.Errorf("Lookup(%q) err = %v, want ErrNotFound", id, err)
		}
	}
}

func TestLookupEndsAnIdleSession(t *testing.T) {
	svc, _, c := setup()
	id, _, _ := svc.Create(ctx, uuid.New(), "")

	c.advance(cfg.IdleTTL)
	if _, err := svc.Lookup(ctx, id); !errors.Is(err, session.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound after %v idle", err, cfg.IdleTTL)
	}
}

func TestLookupSlidesTheIdleExpiry(t *testing.T) {
	svc, store, c := setup()
	id, _, _ := svc.Create(ctx, uuid.New(), "")

	// Used every 6 days, the session outlives its 7-day idle limit.
	for range 4 {
		c.advance(6 * 24 * time.Hour)
		if _, err := svc.Lookup(ctx, id); err != nil {
			t.Fatalf("after %v: %v", c.t, err)
		}
	}
	for _, s := range store.Sessions {
		if !s.LastSeenAt.Equal(c.t) {
			t.Errorf("last seen = %v, want %v", s.LastSeenAt, c.t)
		}
	}
}

func TestLookupWritesAtMostOncePerFewMinutes(t *testing.T) {
	svc, store, c := setup()
	id, created, _ := svc.Create(ctx, uuid.New(), "")

	c.advance(time.Minute)
	if _, err := svc.Lookup(ctx, id); err != nil {
		t.Fatal(err)
	}
	for _, s := range store.Sessions {
		if !s.LastSeenAt.Equal(created.LastSeenAt) {
			t.Error("a lookup one minute after login wrote to the store")
		}
	}
}

func TestLookupNeverExtendsPastTheAbsoluteExpiry(t *testing.T) {
	svc, _, c := setup()
	id, _, _ := svc.Create(ctx, uuid.New(), "")

	for elapsed := time.Duration(0); elapsed < cfg.AbsoluteTTL-24*time.Hour; elapsed += 24 * time.Hour {
		c.advance(24 * time.Hour)
		sess, err := svc.Lookup(ctx, id)
		if err != nil {
			t.Fatalf("day %v: %v", elapsed/(24*time.Hour), err)
		}
		if sess.IdleExpiresAt.After(sess.AbsoluteExpiresAt) {
			t.Fatalf("idle expiry %v is past the absolute expiry %v", sess.IdleExpiresAt, sess.AbsoluteExpiresAt)
		}
	}
	c.advance(24 * time.Hour)
	if _, err := svc.Lookup(ctx, id); !errors.Is(err, session.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound after %v", err, cfg.AbsoluteTTL)
	}
}

func TestDeleteEndsOneSession(t *testing.T) {
	svc, _, _ := setup()
	user := uuid.New()
	a, _, _ := svc.Create(ctx, user, "laptop")
	b, _, _ := svc.Create(ctx, user, "phone")

	if err := svc.Delete(ctx, a); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Lookup(ctx, a); !errors.Is(err, session.ErrNotFound) {
		t.Errorf("deleted session: err = %v, want ErrNotFound", err)
	}
	if _, err := svc.Lookup(ctx, b); err != nil {
		t.Errorf("other session: %v", err)
	}
	if err := svc.Delete(ctx, "garbage"); err != nil {
		t.Errorf("deleting a malformed id: %v", err)
	}
}

func TestDeleteAllForUserEndsEveryDevice(t *testing.T) {
	svc, store, _ := setup()
	me, other := uuid.New(), uuid.New()
	_, _, _ = svc.Create(ctx, me, "laptop")
	_, _, _ = svc.Create(ctx, me, "phone")
	keep, _, _ := svc.Create(ctx, other, "")

	if err := svc.DeleteAllForUser(ctx, me); err != nil {
		t.Fatal(err)
	}
	if n := len(store.ForUser(me)); n != 0 {
		t.Errorf("%d sessions left for the user, want 0", n)
	}
	if _, err := svc.Lookup(ctx, keep); err != nil {
		t.Errorf("another user's session: %v", err)
	}
}

func TestPurgeExpiredKeepsLiveSessions(t *testing.T) {
	svc, store, c := setup()
	user := uuid.New()
	_, _, _ = svc.Create(ctx, user, "old")
	c.advance(cfg.IdleTTL + time.Hour)
	_, _, _ = svc.Create(ctx, user, "new")

	if err := svc.PurgeExpired(ctx, user); err != nil {
		t.Fatal(err)
	}
	left := store.ForUser(user)
	if len(left) != 1 || left[0].UserAgent != "new" {
		t.Errorf("left = %+v, want only the new session", left)
	}
}

func TestStoreErrorsAreReturned(t *testing.T) {
	svc, store, _ := setup()
	id, _, _ := svc.Create(ctx, uuid.New(), "")
	boom := errors.New("boom")
	store.Err = boom

	if _, err := svc.Lookup(ctx, id); !errors.Is(err, boom) {
		t.Errorf("Lookup err = %v, want boom", err)
	}
	if _, _, err := svc.Create(ctx, uuid.New(), ""); !errors.Is(err, boom) {
		t.Errorf("Create err = %v, want boom", err)
	}
}
