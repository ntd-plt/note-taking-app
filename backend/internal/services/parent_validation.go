package services

import (
	"net/http"

	"backend/internal/model"

	"github.com/google/uuid"
)

type folderLookup interface {
	GetFoldersByIDs(ids []uuid.UUID) ([]model.Folder, error)
}

// checkParentFolder verifies that a destination folder exists and belongs to userID.
// A nil id (the top level) is always valid. It returns 0 when the destination is
// acceptable, otherwise the HTTP status to answer with and an error message.
func checkParentFolder(db folderLookup, userID uuid.UUID, id *uuid.UUID) (int, string) {
	if id == nil {
		return 0, ""
	}
	folders, err := db.GetFoldersByIDs([]uuid.UUID{*id})
	if err != nil {
		return http.StatusInternalServerError, err.Error()
	}
	if len(folders) == 0 {
		return http.StatusNotFound, "destination folder not found"
	}
	if folders[0].UserID != userID {
		return http.StatusForbidden, "not authorized to use this destination folder"
	}
	return 0, ""
}

// wouldCreateCycle reports whether giving folderID the parent newParent makes it its
// own ancestor, using parents as the current folder-to-parent map.
func wouldCreateCycle(parents map[uuid.UUID]*uuid.UUID, folderID uuid.UUID, newParent *uuid.UUID) bool {
	visited := map[uuid.UUID]bool{}
	for cur := newParent; cur != nil && !visited[*cur]; cur = parents[*cur] {
		if *cur == folderID {
			return true
		}
		visited[*cur] = true
	}
	return false
}
