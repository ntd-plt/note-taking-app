package database

import (
	"context"
	stderrors "errors"

	"backend/internal/apperr"

	user "backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgreUserDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreUserDataSource(conn *pgxpool.Pool) *PostgreUserDataSource {
	return &PostgreUserDataSource{conn: conn}
}

func (db *PostgreUserDataSource) GetUserByEmail(ctx context.Context, email string) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = $1"
	err := db.conn.QueryRow(ctx, queryString, email).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if stderrors.Is(err, pgx.ErrNoRows) {
			return user.User{}, apperr.NotFoundf("user")
		}
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreUserDataSource) GetUserByID(ctx context.Context, id uuid.UUID) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE id = $1"
	err := db.conn.QueryRow(ctx, queryString, id).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if stderrors.Is(err, pgx.ErrNoRows) {
			return user.User{}, apperr.NotFoundf("user")
		}
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreUserDataSource) UpdateUser(ctx context.Context, u user.User) (user.User, error) {
	var out user.User
	err := db.conn.QueryRow(ctx,
		"UPDATE users SET name = $1, email = $2, updated_at = NOW() WHERE id = $3 RETURNING id, email, name, password_hash, created_at, updated_at",
		u.Name, u.Email, u.ID).Scan(&out.ID, &out.Email, &out.Name, &out.PasswordHash, &out.CreatedAt, &out.UpdatedAt)
	if stderrors.Is(err, pgx.ErrNoRows) {
		return user.User{}, apperr.NotFoundf("user")
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if stderrors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			return user.User{}, apperr.New(apperr.Conflict, "user with this email already exists")
		}
		return user.User{}, err
	}
	return out, nil
}

// AddUser creates the user together with their workspace, the hidden root item
// that holds their top-level pages.
func (db *PostgreUserDataSource) AddUser(ctx context.Context, u user.User) error {
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", u.ID, u.Name, u.Email, u.PasswordHash, u.CreatedAt, u.UpdatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if stderrors.As(err, &pgErr) && pgErr.Code == pgUniqueViolation {
			return apperr.New(apperr.Conflict, "user with this email already exists")
		}
		return err
	}
	if _, err := tx.Exec(ctx, "INSERT INTO items (id, user_id, type) VALUES ($1, $2, 'workspace')", uuid.New(), u.ID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
