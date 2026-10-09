package services

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/google/uuid"
)

type MoveItemEntry struct {
	ID       uuid.UUID
	ParentID *uuid.UUID
}

func (e *MoveItemEntry) UnmarshalJSON(data []byte) error {
	var aux struct {
		ID       *uuid.UUID      `json:"id"`
		ParentID json.RawMessage `json:"parent_id"`
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&aux); err != nil {
		return err
	}
	if aux.ID == nil {
		return errors.New("id is required")
	}
	if aux.ParentID == nil {
		return errors.New("parent_id is required (use null to move an item to the top level)")
	}
	e.ID = *aux.ID
	if string(aux.ParentID) == "null" {
		e.ParentID = nil
		return nil
	}
	var parent uuid.UUID
	if err := json.Unmarshal(aux.ParentID, &parent); err != nil {
		return err
	}
	e.ParentID = &parent
	return nil
}

func PlanMove(snapshot []model.Item, entries []MoveItemEntry) ([]model.ItemMove, error) {
	if len(entries) == 0 {
		return nil, requestErr(http.StatusBadRequest, "no items to move")
	}
	if len(entries) > MaxMoveItems {
		return nil, requestErr(http.StatusBadRequest, "too many items: at most %d per request", MaxMoveItems)
	}

	byID := make(map[uuid.UUID]model.Item, len(snapshot))
	for _, it := range snapshot {
		byID[it.ID] = it
	}

	parentOf := make(map[uuid.UUID]*uuid.UUID, len(snapshot))
	for _, it := range snapshot {
		parentOf[it.ID] = it.ParentID
	}

	seen := make(map[uuid.UUID]bool, len(entries))
	for _, e := range entries {
		if seen[e.ID] {
			return nil, requestErr(http.StatusBadRequest, "item %s is listed more than once", e.ID)
		}
		seen[e.ID] = true
		if _, ok := byID[e.ID]; !ok {
			return nil, requestErr(http.StatusNotFound, "item not found")
		}
		if e.ParentID != nil {
			dest, ok := byID[*e.ParentID]
			if !ok {
				return nil, requestErr(http.StatusNotFound, "destination folder not found")
			}
			if dest.Type != model.ItemTypeFolder {
				return nil, requestErr(http.StatusBadRequest, "destination must be a folder")
			}
		}
		parentOf[e.ID] = e.ParentID
	}

	for _, e := range entries {
		if wouldCreateCycle(parentOf, e.ID, e.ParentID) {
			return nil, requestErr(http.StatusBadRequest, "cannot move a folder into itself or one of its descendants")
		}
	}

	children := make(map[uuid.UUID][]uuid.UUID)
	for id, p := range parentOf {
		if p != nil {
			children[*p] = append(children[*p], id)
		}
	}
	for _, e := range entries {
		if depth(parentOf, e.ID)+height(children, e.ID) > database.MaxTreeDepth {
			return nil, requestErr(http.StatusBadRequest, "items cannot be nested more than %d levels deep", database.MaxTreeDepth)
		}
	}

	var moves []model.ItemMove
	for _, e := range entries {
		if !sameParent(byID[e.ID].ParentID, e.ParentID) {
			moves = append(moves, model.ItemMove{ID: e.ID, ParentID: e.ParentID})
		}
	}
	return moves, nil
}

func depth(parentOf map[uuid.UUID]*uuid.UUID, id uuid.UUID) int {
	n := 0
	for cur := &id; cur != nil && n <= database.MaxTreeDepth+1; cur = parentOf[*cur] {
		n++
	}
	return n
}

func height(children map[uuid.UUID][]uuid.UUID, id uuid.UUID) int {
	best := 0
	level := children[id]
	for len(level) > 0 && best <= database.MaxTreeDepth {
		best++
		var next []uuid.UUID
		for _, c := range level {
			next = append(next, children[c]...)
		}
		level = next
	}
	return best
}
