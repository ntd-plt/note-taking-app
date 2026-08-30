package database

import (
	user "backend/internal/model"

	"github.com/google/uuid"
)

type FoldersDataSource interface {
	CreateFolder(folder user.Folder) (user.Folder, error)
	GetFolderByID(id uuid.UUID) (user.Folder, error)
	GetFolderChildrenByID(id uuid.UUID) ([]user.Item, error)
	GetFoldersByUserID(userID uuid.UUID) ([]user.Folder, error)
	GetFoldersByIDs(ids []uuid.UUID) ([]user.Folder, error)
	UpdateFolders(folders []user.Folder) error
	DeleteFolders(ids []uuid.UUID) error
}
