package services_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func snapshotOf(db *testutil.FakeDatabase, userID uuid.UUID) []model.Item {
	items, _ := db.ListItems(userID, model.ItemFilter{})
	return items
}

func TestPlanDuplicateNamesTheCopyAfterTakenNames(t *testing.T) {
	tests := []struct {
		name     string
		existing []string
		source   string
		want     string
	}{
		{"first copy", nil, "Plan", "Plan (Copy 1)"},
		{"skips taken numbers", []string{"Plan (Copy 1)", "Plan (Copy 2)"}, "Plan", "Plan (Copy 3)"},
		{"fills the first gap", []string{"Plan (Copy 2)"}, "Plan", "Plan (Copy 1)"},
		{"copying a copy does not stack suffixes", []string{"Plan (Copy 1)"}, "Plan (Copy 1)", "Plan (Copy 2)"},
		{"a name that only looks like a suffix", nil, " (Copy 1)", " (Copy 1) (Copy 1)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := testutil.NewFakeDatabase()
			userID := uuid.New()
			src := addNote(db, userID, tt.source, nil)
			for _, n := range tt.existing {
				if n != tt.source {
					addNote(db, userID, n, nil)
				}
			}
			plan, err := services.PlanDuplicate(userID, snapshotOf(db, userID), src.ID, uuid.New)
			if err != nil {
				t.Fatal(err)
			}
			if got := plan.Copies[0].Name; got != tt.want {
				t.Errorf("name = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestPlanDuplicateTruncatesLongNamesToFit(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	src := addNote(db, userID, strings.Repeat("é", services.MaxNameLength), nil)

	plan, err := services.PlanDuplicate(userID, snapshotOf(db, userID), src.ID, uuid.New)
	if err != nil {
		t.Fatal(err)
	}
	got := plan.Copies[0].Name
	if n := len([]rune(got)); n != services.MaxNameLength {
		t.Errorf("name has %d characters, want exactly %d", n, services.MaxNameLength)
	}
	if !strings.HasSuffix(got, " (Copy 1)") {
		t.Errorf("name %q lost its suffix", got)
	}
}

func TestPlanDuplicateCopiesSubtreeParentsFirstAndSorted(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	top := addFolder(db, userID, "Top", nil)
	addNote(db, userID, "z note", &top.ID)
	sub2 := addFolder(db, userID, "b folder", &top.ID)
	sub1 := addFolder(db, userID, "A folder", &top.ID)
	addNote(db, userID, "inner", &sub1.ID)
	addNote(db, userID, "elsewhere", nil)
	_ = sub2

	plan, err := services.PlanDuplicate(userID, snapshotOf(db, userID), top.ID, uuid.New)
	if err != nil {
		t.Fatal(err)
	}

	var got []string
	index := map[uuid.UUID]int{}
	for i, c := range plan.Copies {
		got = append(got, c.Name)
		index[c.NewID] = i
		if c.ParentID != nil && index[*c.ParentID] >= i {
			t.Errorf("copy %q is planned before its parent", c.Name)
		}
	}
	want := []string{"Top (Copy 1)", "A folder", "b folder", "z note", "inner"}
	if !equalStrings(got, want) {
		t.Errorf("copies = %v, want %v (only the top copy renamed; folders first, then by name)", got, want)
	}
	if plan.Copies[0].ParentID != nil {
		t.Errorf("top copy parent = %v, want the original's (nil)", plan.Copies[0].ParentID)
	}
	if plan.Copies[1].ParentID == nil || *plan.Copies[1].ParentID != plan.Copies[0].NewID {
		t.Error("children must hang off the copy, not the original")
	}
	seen := map[uuid.UUID]bool{}
	for _, c := range plan.Copies {
		if seen[c.NewID] || c.NewID == c.SourceID {
			t.Errorf("copy %q reuses an id", c.Name)
		}
		seen[c.NewID] = true
	}
}

func TestPlanDuplicateRowCap(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	folder := addFolder(db, userID, "Big", nil)
	for i := 0; i < services.MaxDuplicateRows; i++ {
		addNote(db, userID, "n", &folder.ID)
	}

	_, err := services.PlanDuplicate(userID, snapshotOf(db, userID), folder.ID, uuid.New)
	var re *services.RequestError
	if err == nil || !asRequestError(err, &re) || re.Status != http.StatusBadRequest {
		t.Errorf("err = %v, want a 400 request error for exceeding %d rows", err, services.MaxDuplicateRows)
	}
}

func TestPlanDuplicateMissingSource(t *testing.T) {
	userID := uuid.New()
	_, err := services.PlanDuplicate(userID, nil, uuid.New(), uuid.New)
	var re *services.RequestError
	if err == nil || !asRequestError(err, &re) || re.Status != http.StatusNotFound {
		t.Errorf("err = %v, want a 404 request error", err)
	}
}

func asRequestError(err error, target **services.RequestError) bool {
	re, ok := err.(*services.RequestError)
	if ok {
		*target = re
	}
	return ok
}

func TestPlanMoveDepthLimit(t *testing.T) {
	db := testutil.NewFakeDatabase()
	userID := uuid.New()
	var deepest *model.Item
	for i := 0; i < 63; i++ {
		var parent *uuid.UUID
		if deepest != nil {
			parent = &deepest.ID
		}
		f := addFolder(db, userID, "level", parent)
		deepest = &f
	}
	shallow := addFolder(db, userID, "tree", nil)
	addFolder(db, userID, "tree child", &shallow.ID)

	_, err := services.PlanMove(snapshotOf(db, userID), []services.MoveItemEntry{{ID: shallow.ID, ParentID: &deepest.ID}})
	var re *services.RequestError
	if err == nil || !asRequestError(err, &re) || re.Status != http.StatusBadRequest {
		t.Errorf("err = %v, want a 400 for nesting beyond the limit", err)
	}
}

func TestMoveItemEntryParentIDNullVersusMissing(t *testing.T) {
	var null, set, missing services.MoveItemEntry
	id := uuid.New()
	if err := json.Unmarshal([]byte(`{"id":"`+id.String()+`","parent_id":null}`), &null); err != nil || null.ParentID != nil || null.ID != id {
		t.Errorf("null parent: entry = %+v, err = %v", null, err)
	}
	if err := json.Unmarshal([]byte(`{"id":"`+id.String()+`","parent_id":"`+id.String()+`"}`), &set); err != nil || set.ParentID == nil || *set.ParentID != id {
		t.Errorf("set parent: entry = %+v, err = %v", set, err)
	}
	if err := json.Unmarshal([]byte(`{"id":"`+id.String()+`"}`), &missing); err == nil {
		t.Error("a missing parent_id must be an error, not a silent move to the top level")
	}
}
