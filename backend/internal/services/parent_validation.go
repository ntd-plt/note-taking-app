package services

import (
	"fmt"
	"net/http"

	"backend/internal/model"

	"github.com/google/uuid"
)

const (
	MaxNameLength    = 255
	MaxIconLength    = 32
	MaxContentBytes  = 1 << 20
	MaxMoveItems     = 200
	MaxDuplicateRows = 1000

	defaultNoteIcon   = "📄"
	defaultFolderIcon = "📁"
)

func defaultIcon(t model.ItemType) string {
	if t == model.ItemTypeFolder {
		return defaultFolderIcon
	}
	return defaultNoteIcon
}

type RequestError struct {
	Status  int
	Message string
}

func (e *RequestError) Error() string { return e.Message }

func requestErr(status int, format string, args ...any) *RequestError {
	return &RequestError{Status: status, Message: fmt.Sprintf(format, args...)}
}

// wouldCreateCycle reports whether giving folderID the parent newParent makes it its
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

func (s *ItemsService) checkParent(userID uuid.UUID, parentID *uuid.UUID) *RequestError {
	if parentID == nil {
		return nil
	}
	parent, err := s.db.GetItem(userID, *parentID)
	if err != nil {
		if isNotFound(err) {
			return requestErr(http.StatusNotFound, "parent folder not found")
		}
		return internalErr(err)
	}
	if parent.Type != model.ItemTypeFolder {
		return requestErr(http.StatusBadRequest, "parent must be a folder")
	}
	return nil
}
