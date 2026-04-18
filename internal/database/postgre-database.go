package database

import (
	"context"
	"fmt"

	"note-taking-app/internal/configs"
	user "note-taking-app/internal/model"

	"github.com/jackc/pgx/v5"
)

type PostgreDatabase struct {
	conn *pgx.Conn
}

func NewPostgreDatabase() *PostgreDatabase {
	return &PostgreDatabase{}
}

func (db *PostgreDatabase) GetUserByEmail(email string) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = $1"
	err := db.conn.QueryRow(context.Background(), queryString, email).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreDatabase) GetUserByID(id int) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreDatabase) Connect() error {
	config, err := configs.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}
	url := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		config.DBUser, config.DBPass, config.DBHost, config.DBPort, config.DBName)

	conn, err := pgx.Connect(context.Background(), url)
	db.conn = conn

	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	return nil
}

func (db *PostgreDatabase) Disconnect() error {
	if db.conn != nil {
		return db.conn.Close(context.Background())
	}
	return nil
}

func (db *PostgreDatabase) AddUser(u user.User) error {
	_, err := db.conn.Exec(context.Background(), "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", u.ID, u.Name, u.Email, u.PasswordHash, u.CreatedAt, u.UpdatedAt)
	return err
}
