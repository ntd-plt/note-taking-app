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
	GetNoteByID(id uuid.UUID) (user.Note, error)
	GetNotesByUserID(userID uuid.UUID) ([]user.Note, error)
	UpdateNotes(notes []user.Note) error
	DeleteNotes(ids []uuid.UUID) error

	CreateFolder(folder user.Folder) (user.Folder, error)
	GetFolderByID(id uuid.UUID) (user.Folder, error)
	GetFolderChildrenByID(id uuid.UUID) ([]user.Item, error)
	GetFoldersByUserID(userID uuid.UUID) ([]user.Folder, error)
	GetFoldersByIDs(ids []uuid.UUID) ([]user.Folder, error)
	UpdateFolders(folders []user.Folder) error
	DeleteFolders(ids []uuid.UUID) error
}
