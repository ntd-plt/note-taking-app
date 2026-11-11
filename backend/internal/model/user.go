package model

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID           uuid.UUID `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email,omitempty"`
	PasswordHash []byte    `json:"password_hash,omitempty"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func NewUser(name, email string, passwordHash []byte) User {
	now := time.Now()
	return User{ID: uuid.New(), Name: name, Email: email, PasswordHash: passwordHash, CreatedAt: now, UpdatedAt: now}
}
