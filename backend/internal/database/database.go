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

	CreateNote(note user.Note, parentID *uuid.UUID) (user.Note, error)
	GetNoteByID(id uuid.UUID) (user.Note, error)
	GetNotesByUserID(userID uuid.UUID) ([]user.Note, error)
	UpdateNote(note user.Note) error
	DeleteNote(id uuid.UUID) error

	CreateFolder(folder user.Folder) (user.Folder, error)
	GetFolderByID(id uuid.UUID) (user.Folder, error)
	GetFoldersByUserID(userID uuid.UUID) ([]user.Folder, error)
	UpdateFolder(folder user.Folder) error
	DeleteFolder(id uuid.UUID) error
}
