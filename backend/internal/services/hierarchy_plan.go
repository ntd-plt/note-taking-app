package services

import (
	"fmt"
	"regexp"
	"strconv"
	"unicode/utf8"

	"backend/internal/model"

	"github.com/google/uuid"
)

const (
	ItemTypeNote   = "note"
	ItemTypeFolder = "folder"

	// MaxMoveItems caps the number of selected items in one request.
	MaxMoveItems = 200
	// MaxMoveCreatedRows caps the rows created as clones in one request.
	MaxMoveCreatedRows = 1000
	// maxNameLength matches the VARCHAR(255) columns for folder names and note titles.
	maxNameLength = 255
)

// MoveItemRef identifies one selected item.
type MoveItemRef struct {
	ID   uuid.UUID `json:"id" binding:"required"`
	Type string    `json:"type" binding:"required,oneof=note folder"`
}

type MoveErrorKind int

const (
	MoveInvalid MoveErrorKind = iota
	MoveNotFound
	MoveForbidden
)

// MoveError is a planning failure that maps onto an HTTP status.
type MoveError struct {
	Kind    MoveErrorKind
	Message string
	ID      *uuid.UUID
}

func (e *MoveError) Error() string { return e.Message }

func moveErr(kind MoveErrorKind, id *uuid.UUID, format string, args ...any) *MoveError {
	return &MoveError{Kind: kind, ID: id, Message: fmt.Sprintf(format, args...)}
}

var copySuffixPattern = regexp.MustCompile(`^(.*) \(Copy \d+\)$`)

// baseName strips one trailing " (Copy N)" so cloning a clone does not stack suffixes.
func baseName(name string) string {
	if m := copySuffixPattern.FindStringSubmatch(name); m != nil && m[1] != "" {
		return m[1]
	}
	return name
}

// cloneName returns the smallest "base (Copy N)" not present in occupied, with the
// base truncated so the whole name fits the column. The result is added to occupied.
func cloneName(name string, occupied map[string]bool) string {
	base := baseName(name)
	for n := 1; ; n++ {
		suffix := " (Copy " + strconv.Itoa(n) + ")"
		room := maxNameLength - utf8.RuneCountInString(suffix)
		trimmed := base
		if utf8.RuneCountInString(trimmed) > room {
			trimmed = string([]rune(trimmed)[:room])
		}
		candidate := trimmed + suffix
		if !occupied[candidate] {
			occupied[candidate] = true
			return candidate
		}
	}
}

// planIndex holds a snapshot indexed for lookups by id and by parent.
type planIndex struct {
	snap         model.HierarchySnapshot
	folders      map[uuid.UUID]model.HierarchyFolderNode
	childFolders map[uuid.UUID][]model.HierarchyFolderNode
	notes        map[uuid.UUID]model.HierarchyNoteNode
	childNotes   map[uuid.UUID][]model.HierarchyNoteNode
}

func newPlanIndex(snap model.HierarchySnapshot) *planIndex {
	ix := &planIndex{
		snap:         snap,
		folders:      make(map[uuid.UUID]model.HierarchyFolderNode, len(snap.Folders)),
		childFolders: make(map[uuid.UUID][]model.HierarchyFolderNode),
		notes:        make(map[uuid.UUID]model.HierarchyNoteNode, len(snap.Notes)),
		childNotes:   make(map[uuid.UUID][]model.HierarchyNoteNode),
	}
	for _, f := range snap.Folders {
		ix.folders[f.ID] = f
		if f.ParentID != nil {
			ix.childFolders[*f.ParentID] = append(ix.childFolders[*f.ParentID], f)
		}
	}
	for _, n := range snap.Notes {
		ix.notes[n.ID] = n
		if n.FolderID != nil {
			ix.childNotes[*n.FolderID] = append(ix.childNotes[*n.FolderID], n)
		}
	}
	return ix
}

// missing explains why an id is absent from the user's own snapshot.
func (ix *planIndex) missing(id uuid.UUID, what string) *MoveError {
	if ix.snap.Foreign[id] {
		return moveErr(MoveForbidden, &id, "not authorized to access this %s", what)
	}
	return moveErr(MoveNotFound, &id, "%s not found", what)
}

// resolveSelection validates the request items and splits them by type, in request
// order and without duplicate entries.
func (ix *planIndex) resolveSelection(items []MoveItemRef) (folders, notes []uuid.UUID, err error) {
	if len(items) == 0 {
		return nil, nil, moveErr(MoveInvalid, nil, "no items selected")
	}
	if len(items) > MaxMoveItems {
		return nil, nil, moveErr(MoveInvalid, nil, "too many items: at most %d per request", MaxMoveItems)
	}
	seen := make(map[uuid.UUID]bool, len(items))
	for _, it := range items {
		if seen[it.ID] {
			continue
		}
		seen[it.ID] = true
		switch it.Type {
		case ItemTypeFolder:
			if _, ok := ix.folders[it.ID]; !ok {
				return nil, nil, ix.missing(it.ID, "folder")
			}
			folders = append(folders, it.ID)
		case ItemTypeNote:
			if _, ok := ix.notes[it.ID]; !ok {
				return nil, nil, ix.missing(it.ID, "note")
			}
			notes = append(notes, it.ID)
		default:
			id := it.ID
			return nil, nil, moveErr(MoveInvalid, &id, "unknown item type %q", it.Type)
		}
	}
	return folders, notes, nil
}

// clonePlanner appends clones to a plan while enforcing the created-rows cap.
type clonePlanner struct {
	ix      *planIndex
	newID   func() uuid.UUID
	plan    *model.MovePlan
	created int
}

func (c *clonePlanner) count(n int) *MoveError {
	c.created += n
	if c.created > MaxMoveCreatedRows {
		return moveErr(MoveInvalid, nil, "too many rows to create: at most %d clones per request", MaxMoveCreatedRows)
	}
	return nil
}

func (c *clonePlanner) cloneNote(sourceID uuid.UUID, folder *uuid.UUID, title string) *MoveError {
	if err := c.count(1); err != nil {
		return err
	}
	c.plan.NoteClones = append(c.plan.NoteClones, model.NoteClone{
		SourceID: sourceID, NewID: c.newID(), FolderID: folder, Title: title,
	})
	return nil
}

// cloneFolder copies a folder and, recursively, everything inside it. Only the top
// folder takes the given name; its contents keep theirs. Parents precede children.
func (c *clonePlanner) cloneFolder(sourceID uuid.UUID, parent *uuid.UUID, name string) *MoveError {
	if err := c.count(1); err != nil {
		return err
	}
	root := model.FolderClone{SourceID: sourceID, NewID: c.newID(), ParentID: parent, Name: name}
	c.plan.FolderClones = append(c.plan.FolderClones, root)

	type frame struct{ sourceID, cloneID uuid.UUID }
	queue := []frame{{sourceID, root.NewID}}
	visited := map[uuid.UUID]bool{sourceID: true}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		cloneParent := cur.cloneID
		for _, child := range c.ix.childFolders[cur.sourceID] {
			if visited[child.ID] {
				continue
			}
			visited[child.ID] = true
			if err := c.count(1); err != nil {
				return err
			}
			clone := model.FolderClone{SourceID: child.ID, NewID: c.newID(), ParentID: &cloneParent, Name: child.Name}
			c.plan.FolderClones = append(c.plan.FolderClones, clone)
			queue = append(queue, frame{child.ID, clone.NewID})
		}
		for _, child := range c.ix.childNotes[cur.sourceID] {
			if err := c.cloneNote(child.ID, &cloneParent, child.Title); err != nil {
				return err
			}
		}
	}
	return nil
}

func sameParent(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

// PlanMove validates a move request against a snapshot and builds the change set.
//
// Selected items with no selected ancestor folder are moved (same id). Selected
// items that sit inside another selected folder are cloned next to the moved
// parent, so the destination gains exactly one new direct entry per selected item.
// newID supplies ids for clones; pass uuid.New in production.
func PlanMove(
	userID uuid.UUID,
	snap model.HierarchySnapshot,
	items []MoveItemRef,
	destination *uuid.UUID,
	newID func() uuid.UUID,
) (model.MovePlan, error) {
	ix := newPlanIndex(snap)
	selFolders, selNotes, err := ix.resolveSelection(items)
	if err != nil {
		return model.MovePlan{}, err
	}
	selectedFolder := make(map[uuid.UUID]bool, len(selFolders))
	for _, id := range selFolders {
		selectedFolder[id] = true
	}

	// The destination must exist, belong to the user, and not sit inside the selection.
	if destination != nil {
		if _, ok := ix.folders[*destination]; !ok {
			return model.MovePlan{}, ix.missing(*destination, "destination folder")
		}
		visited := map[uuid.UUID]bool{}
		for cur := destination; cur != nil && !visited[*cur]; {
			if selectedFolder[*cur] {
				return model.MovePlan{}, moveErr(MoveInvalid, destination, "cannot move a folder into itself or one of its descendants")
			}
			visited[*cur] = true
			cur = ix.folders[*cur].ParentID
		}
	}

	// hasSelectedAncestor reports whether a selected folder strictly contains the item.
	hasSelectedAncestor := func(parent *uuid.UUID) bool {
		visited := map[uuid.UUID]bool{}
		for cur := parent; cur != nil && !visited[*cur]; {
			if selectedFolder[*cur] {
				return true
			}
			visited[*cur] = true
			cur = ix.folders[*cur].ParentID
		}
		return false
	}

	plan := model.MovePlan{UserID: userID, Destination: destination}
	var cloneFolderSources, cloneNoteSources []uuid.UUID
	for _, id := range selFolders {
		if hasSelectedAncestor(ix.folders[id].ParentID) {
			cloneFolderSources = append(cloneFolderSources, id)
		} else {
			plan.MovedFolders = append(plan.MovedFolders, id)
		}
	}
	for _, id := range selNotes {
		if hasSelectedAncestor(ix.notes[id].FolderID) {
			cloneNoteSources = append(cloneNoteSources, id)
		} else {
			plan.MovedNotes = append(plan.MovedNotes, id)
		}
	}

	// Names already taken in the destination: its current children plus arriving items.
	occupiedFolders := map[string]bool{}
	occupiedNotes := map[string]bool{}
	for _, f := range snap.Folders {
		if sameParent(f.ParentID, destination) {
			occupiedFolders[f.Name] = true
		}
	}
	for _, n := range snap.Notes {
		if sameParent(n.FolderID, destination) {
			occupiedNotes[n.Title] = true
		}
	}
	for _, id := range plan.MovedFolders {
		occupiedFolders[ix.folders[id].Name] = true
	}
	for _, id := range plan.MovedNotes {
		occupiedNotes[ix.notes[id].Title] = true
	}

	cp := &clonePlanner{ix: ix, newID: newID, plan: &plan}
	for _, id := range cloneFolderSources {
		if err := cp.cloneFolder(id, destination, cloneName(ix.folders[id].Name, occupiedFolders)); err != nil {
			return model.MovePlan{}, err
		}
	}
	for _, id := range cloneNoteSources {
		if err := cp.cloneNote(id, destination, cloneName(ix.notes[id].Title, occupiedNotes)); err != nil {
			return model.MovePlan{}, err
		}
	}
	return plan, nil
}

// PlanDuplicate builds the change set for duplicating items in place: each selected
// item is cloned next to itself, in its own parent, with the same "Name (Copy N)"
// naming and recursive folder copying that moves use. Nothing is moved.
func PlanDuplicate(
	userID uuid.UUID,
	snap model.HierarchySnapshot,
	items []MoveItemRef,
	newID func() uuid.UUID,
) (model.MovePlan, error) {
	ix := newPlanIndex(snap)
	selFolders, selNotes, err := ix.resolveSelection(items)
	if err != nil {
		return model.MovePlan{}, err
	}

	// Names taken per parent and type, so several copies in one request stay distinct.
	type slot struct {
		parent uuid.UUID
		root   bool
		folder bool
	}
	taken := map[slot]map[string]bool{}
	occupied := func(parent *uuid.UUID, folder bool) map[string]bool {
		k := slot{root: parent == nil, folder: folder}
		if parent != nil {
			k.parent = *parent
		}
		if m, ok := taken[k]; ok {
			return m
		}
		m := map[string]bool{}
		if folder {
			for _, f := range snap.Folders {
				if sameParent(f.ParentID, parent) {
					m[f.Name] = true
				}
			}
		} else {
			for _, n := range snap.Notes {
				if sameParent(n.FolderID, parent) {
					m[n.Title] = true
				}
			}
		}
		taken[k] = m
		return m
	}

	plan := model.MovePlan{UserID: userID}
	cp := &clonePlanner{ix: ix, newID: newID, plan: &plan}
	for _, id := range selFolders {
		f := ix.folders[id]
		if err := cp.cloneFolder(id, f.ParentID, cloneName(f.Name, occupied(f.ParentID, true))); err != nil {
			return model.MovePlan{}, err
		}
	}
	for _, id := range selNotes {
		n := ix.notes[id]
		if err := cp.cloneNote(id, n.FolderID, cloneName(n.Title, occupied(n.FolderID, false))); err != nil {
			return model.MovePlan{}, err
		}
	}
	return plan, nil
}
