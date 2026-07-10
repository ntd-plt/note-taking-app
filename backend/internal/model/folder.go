package model

import (
	"time"

	"github.com/google/uuid"
)

type Folder struct {
	ID             uuid.UUID  `json:"id"`
	ParentFolderID *uuid.UUID `json:"parent_folder_id"` // nil for root folders
	Name           string     `json:"name"`
	UserID         uuid.UUID  `json:"user_id"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}
