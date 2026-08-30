package database

import (
	"context"
	stderrors "errors"

	"backend/internal/pkg"

	user "backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// postgresUniqueViolationCode is the Postgres SQLSTATE for unique_violation.
const postgresUniqueViolationCode = "23505"

type PostgreUserDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreUserDataSource(conn *pgxpool.Pool) *PostgreUserDataSource {
	return &PostgreUserDataSource{conn: conn}
}

func (db *PostgreUserDataSource) GetUserByEmail(email string) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = $1"
	err := db.conn.QueryRow(context.Background(), queryString, email).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if stderrors.Is(err, pgx.ErrNoRows) {
			return user.User{}, pkg.NewNotFoundError("user")
		}
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreUserDataSource) GetUserByID(id uuid.UUID) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if stderrors.Is(err, pgx.ErrNoRows) {
			return user.User{}, pkg.NewNotFoundError("user")
		}
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreUserDataSource) AddUser(u user.User) error {
	_, err := db.conn.Exec(context.Background(), "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", u.ID, u.Name, u.Email, u.PasswordHash, u.CreatedAt, u.UpdatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if stderrors.As(err, &pgErr) && pgErr.Code == postgresUniqueViolationCode {
			return pkg.NewAlreadyExistsError("user with this email")
		}
		return err
	}
	return nil
}
