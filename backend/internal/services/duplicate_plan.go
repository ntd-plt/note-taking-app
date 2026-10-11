package services

import (
	"net/http"
	"regexp"
	"strconv"
	"unicode/utf8"

	"backend/internal/model"

	"github.com/google/uuid"
)

var copySuffixPattern = regexp.MustCompile(`^(.*) \(Copy \d+\)$`)

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
		room := MaxNameLength - utf8.RuneCountInString(suffix)
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

func PlanDuplicate(
	userID uuid.UUID,
	snapshot []model.Item,
	sourceID uuid.UUID,
	newID func() uuid.UUID,
) (model.DuplicatePlan, error) {
	byID := make(map[uuid.UUID]model.Item, len(snapshot))
	children := make(map[uuid.UUID][]model.Item)
	for _, it := range snapshot {
		byID[it.ID] = it
		if it.ParentID != nil {
			children[*it.ParentID] = append(children[*it.ParentID], it)
		}
	}
	source, ok := byID[sourceID]
	if !ok {
		return model.DuplicatePlan{}, requestErr(http.StatusNotFound, "item not found")
	}

	occupied := map[string]bool{}
	for _, it := range snapshot {
		if sameParent(it.ParentID, source.ParentID) {
			occupied[it.Name] = true
		}
	}

	plan := model.DuplicatePlan{UserID: userID}
	root := model.ItemCopy{
		SourceID: source.ID,
		NewID:    newID(),
		ParentID: source.ParentID,
		Type:     source.Type,
		Name:     cloneName(source.Name, occupied),
	}
	plan.Copies = append(plan.Copies, root)

	type frame struct{ sourceID, copyID uuid.UUID }
	queue := []frame{{source.ID, root.NewID}}
	visited := map[uuid.UUID]bool{source.ID: true}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		kids := append([]model.Item(nil), children[cur.sourceID]...)
		model.SortItems(kids)
		for _, kid := range kids {
			if visited[kid.ID] {
				continue
			}
			visited[kid.ID] = true
			if len(plan.Copies) >= MaxDuplicateRows {
				return model.DuplicatePlan{}, requestErr(http.StatusBadRequest,
					"too many items to copy: at most %d per request", MaxDuplicateRows)
			}
			parent := cur.copyID
			c := model.ItemCopy{SourceID: kid.ID, NewID: newID(), ParentID: &parent, Type: kid.Type, Name: kid.Name}
			plan.Copies = append(plan.Copies, c)
			if kid.Type == model.ItemTypeFolder {
				queue = append(queue, frame{kid.ID, c.NewID})
			}
		}
	}
	return plan, nil
}

func sameParent(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}
