// Package session keeps users logged in with server-side sessions. A session is a
// random id handed to the browser in a cookie; the server stores only its SHA-256
// hash, so it can end a session at any time (logout, logout everywhere) by deleting
// the row.
package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"time"

	"github.com/google/uuid"
)

const (
	idBytes = 32
	// touchEvery bounds how often Lookup writes: the idle expiry moves forward at
	// most once per touchEvery, so most requests only read.
	touchEvery = 5 * time.Minute
	// maxUserAgent is the longest user agent kept, in runes, as the column allows.
	maxUserAgent = 512
)

// ErrNotFound means the session id is unknown, malformed or expired.
var ErrNotFound = errors.New("session not found")

// Session is one login on one browser.
type Session struct {
	IDHash            []byte
	UserID            uuid.UUID
	CreatedAt         time.Time
	LastSeenAt        time.Time
	IdleExpiresAt     time.Time
	AbsoluteExpiresAt time.Time
	UserAgent         string
}

// Store keeps sessions by the hash of their id.
type Store interface {
	Insert(ctx context.Context, s Session) error
	// Get returns the session with this id hash, or ErrNotFound.
	Get(ctx context.Context, idHash []byte) (Session, error)
	// Touch records use of a session and moves its idle expiry.
	Touch(ctx context.Context, idHash []byte, lastSeen, idleExpires time.Time) error
	Delete(ctx context.Context, idHash []byte) error
	DeleteAllForUser(ctx context.Context, userID uuid.UUID) error
	// DeleteExpired removes the user's sessions that ended before now.
	DeleteExpired(ctx context.Context, userID uuid.UUID, now time.Time) error
}

// Config sets how long sessions last.
type Config struct {
	// IdleTTL ends a session that has not been used for this long.
	IdleTTL time.Duration
	// AbsoluteTTL ends a session this long after login, however much it is used.
	AbsoluteTTL time.Duration
}

type Service struct {
	store Store
	cfg   Config
	now   func() time.Time
}

func NewService(store Store, cfg Config) *Service {
	return &Service{store: store, cfg: cfg, now: time.Now}
}

// WithClock returns the service using now as its clock, for tests.
func (s *Service) WithClock(now func() time.Time) *Service {
	c := *s
	c.now = now
	return &c
}

// Create starts a session for the user and returns the id to put in the cookie.
func (s *Service) Create(ctx context.Context, userID uuid.UUID, userAgent string) (string, Session, error) {
	raw := make([]byte, idBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", Session{}, err
	}
	now := s.now()
	absolute := now.Add(s.cfg.AbsoluteTTL)
	sess := Session{
		IDHash:            hashID(raw),
		UserID:            userID,
		CreatedAt:         now,
		LastSeenAt:        now,
		IdleExpiresAt:     earliest(now.Add(s.cfg.IdleTTL), absolute),
		AbsoluteExpiresAt: absolute,
		UserAgent:         truncate(userAgent, maxUserAgent),
	}
	if err := s.store.Insert(ctx, sess); err != nil {
		return "", Session{}, err
	}
	return base64.RawURLEncoding.EncodeToString(raw), sess, nil
}

// Lookup returns the live session for a cookie id, or ErrNotFound. Using a session
// moves its idle expiry forward, never past its absolute expiry.
func (s *Service) Lookup(ctx context.Context, id string) (Session, error) {
	idHash, ok := parseID(id)
	if !ok {
		return Session{}, ErrNotFound
	}
	sess, err := s.store.Get(ctx, idHash)
	if err != nil {
		return Session{}, err
	}
	now := s.now()
	if !now.Before(sess.IdleExpiresAt) || !now.Before(sess.AbsoluteExpiresAt) {
		return Session{}, ErrNotFound
	}
	if now.Sub(sess.LastSeenAt) >= touchEvery {
		idle := earliest(now.Add(s.cfg.IdleTTL), sess.AbsoluteExpiresAt)
		if err := s.store.Touch(ctx, idHash, now, idle); err != nil {
			return Session{}, err
		}
		sess.LastSeenAt, sess.IdleExpiresAt = now, idle
	}
	return sess, nil
}

// Delete ends the session with this cookie id. An unknown id is not an error.
func (s *Service) Delete(ctx context.Context, id string) error {
	idHash, ok := parseID(id)
	if !ok {
		return nil
	}
	return s.store.Delete(ctx, idHash)
}

// DeleteAllForUser ends every session of the user, on every device.
func (s *Service) DeleteAllForUser(ctx context.Context, userID uuid.UUID) error {
	return s.store.DeleteAllForUser(ctx, userID)
}

// PurgeExpired removes the user's sessions that have ended. It runs at login, so
// the table holds about one row per device in use.
func (s *Service) PurgeExpired(ctx context.Context, userID uuid.UUID) error {
	return s.store.DeleteExpired(ctx, userID, s.now())
}

// MaxAge is how long the browser should keep the cookie: the server ends the
// session sooner when it sits idle.
func (s *Service) MaxAge() time.Duration { return s.cfg.AbsoluteTTL }

func parseID(id string) ([]byte, bool) {
	raw, err := base64.RawURLEncoding.DecodeString(id)
	if err != nil || len(raw) != idBytes {
		return nil, false
	}
	return hashID(raw), true
}

func hashID(raw []byte) []byte {
	sum := sha256.Sum256(raw)
	return sum[:]
}

func earliest(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func truncate(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}
