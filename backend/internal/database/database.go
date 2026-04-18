package database

import (
	user "backend/internal/model"

	"github.com/google/uuid"
)

type Database interface {
	Connect() error
	Disconnect() error
	GetUserByEmail(email string) (user.User, error)
	GetUserByID(id uuid.UUID) (user.User, error)
	AddUser(user user.User) error

	CreateNote(note user.Note) (user.Note, error)
	GetNoteByID(id int) (user.Note, error)
	GetNotesByUserID(userID uuid.UUID) ([]user.Note, error)
	UpdateNote(note user.Note) error
	DeleteNote(id int) error
}
