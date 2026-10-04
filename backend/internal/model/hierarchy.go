package model

import "github.com/google/uuid"

// HierarchyFolderNode is the lightweight view of a folder used to plan a move.
type HierarchyFolderNode struct {
	ID       uuid.UUID
	ParentID *uuid.UUID
	Name     string
}

// HierarchyNoteNode is the lightweight view of a note used to plan a move.
// Note content is intentionally absent: clones copy it inside the database.
type HierarchyNoteNode struct {
	ID       uuid.UUID
	FolderID *uuid.UUID
	Title    string
}

// HierarchySnapshot holds every folder and note owned by one user, plus the
// probed ids that exist but belong to somebody else.
type HierarchySnapshot struct {
	Folders []HierarchyFolderNode
	Notes   []HierarchyNoteNode
	Foreign map[uuid.UUID]bool
}

// FolderClone describes a folder to create as a copy of SourceID.
type FolderClone struct {
	SourceID uuid.UUID
	NewID    uuid.UUID
	ParentID *uuid.UUID
	Name     string
}

// NoteClone describes a note to create as a copy of SourceID.
type NoteClone struct {
	SourceID uuid.UUID
	NewID    uuid.UUID
	FolderID *uuid.UUID
	Title    string
}

// MovePlan is the fully validated set of changes for one move request.
// FolderClones is ordered so that a parent always precedes its children.
type MovePlan struct {
	UserID       uuid.UUID
	Destination  *uuid.UUID
	MovedFolders []uuid.UUID
	MovedNotes   []uuid.UUID
	FolderClones []FolderClone
	NoteClones   []NoteClone
}

// MoveResult is what a move changed: the rows that were re-parented and the
// rows that were created as clones.
type MoveResult struct {
	MovedFolders   []Folder
	MovedNotes     []Note
	CreatedFolders []Folder
	CreatedNotes   []Note
}
