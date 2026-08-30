package database

import (
	user "backend/internal/model"

	"github.com/google/uuid"
)

type NotesDataSource interface {
	CreateNote(note user.Note) (user.Note, error)
	GetNoteByID(id uuid.UUID) (user.Note, error)
	GetNotesByUserID(userID uuid.UUID) ([]user.Note, error)
	UpdateNotes(notes []user.Note) error
	DeleteNotes(ids []uuid.UUID) error
}
