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

func New() *User {
	return &User{
		ID:           uuid.New(),
		Name:         "Default",
		Email:        "default@gmail.com",
		PasswordHash: []byte("default"),
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
}

func (u *User) WithEmail(email string) *User {
	u.Email = email
	return u
}

func (u *User) WithUsername(username string) *User {
	u.Name = username
	return u
}

func (u *User) WithPasswordHash(passwordHash []byte) *User {
	u.PasswordHash = passwordHash
	return u
}
