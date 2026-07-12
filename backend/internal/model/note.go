package model

import (
	"time"

	"github.com/google/uuid"
)

type Note struct {
	ID        uuid.UUID  `json:"id"`
	Title     string     `json:"title"`
	Content   string     `json:"content"`
	FolderID  *uuid.UUID `json:"folder_id"` // nil for notes outside any folder
	UserID    uuid.UUID  `json:"user_id"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}
