package database

import (
	"context"
	"errors"
	"time"

	"backend/internal/session"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgreSessionStore struct {
	conn *pgxpool.Pool
}

var _ session.Store = (*PostgreSessionStore)(nil)

func NewPostgreSessionStore(conn *pgxpool.Pool) *PostgreSessionStore {
	return &PostgreSessionStore{conn: conn}
}

func (db *PostgreSessionStore) Insert(ctx context.Context, s session.Session) error {
	_, err := db.conn.Exec(ctx, `
		INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		s.IDHash, s.UserID, s.CreatedAt, s.LastSeenAt, s.IdleExpiresAt, s.AbsoluteExpiresAt, s.UserAgent)
	return err
}

func (db *PostgreSessionStore) Get(ctx context.Context, idHash []byte) (session.Session, error) {
	var s session.Session
	err := db.conn.QueryRow(ctx, `
		SELECT id_hash, user_id, created_at, last_seen_at, idle_expires_at, absolute_expires_at, user_agent
		FROM sessions WHERE id_hash = $1`, idHash).
		Scan(&s.IDHash, &s.UserID, &s.CreatedAt, &s.LastSeenAt, &s.IdleExpiresAt, &s.AbsoluteExpiresAt, &s.UserAgent)
	if errors.Is(err, pgx.ErrNoRows) {
		return session.Session{}, session.ErrNotFound
	}
	return s, err
}

func (db *PostgreSessionStore) Touch(ctx context.Context, idHash []byte, lastSeen, idleExpires time.Time) error {
	_, err := db.conn.Exec(ctx,
		"UPDATE sessions SET last_seen_at = $2, idle_expires_at = $3 WHERE id_hash = $1",
		idHash, lastSeen, idleExpires)
	return err
}

func (db *PostgreSessionStore) Delete(ctx context.Context, idHash []byte) error {
	_, err := db.conn.Exec(ctx, "DELETE FROM sessions WHERE id_hash = $1", idHash)
	return err
}

func (db *PostgreSessionStore) DeleteAllForUser(ctx context.Context, userID uuid.UUID) error {
	_, err := db.conn.Exec(ctx, "DELETE FROM sessions WHERE user_id = $1", userID)
	return err
}

func (db *PostgreSessionStore) DeleteExpired(ctx context.Context, userID uuid.UUID, now time.Time) error {
	_, err := db.conn.Exec(ctx,
		"DELETE FROM sessions WHERE user_id = $1 AND (idle_expires_at <= $2 OR absolute_expires_at <= $2)",
		userID, now)
	return err
}
