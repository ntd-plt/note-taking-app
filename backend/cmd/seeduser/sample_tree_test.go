package main

import (
	"slices"
	"strings"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func seedFake(t *testing.T, nodes []node) (*testutil.FakeDatabase, uuid.UUID, []model.Item) {
	t.Helper()
	db := testutil.NewFakeDatabase()
	user := model.New()
	if err := db.AddUser(*user); err != nil {
		t.Fatal(err)
	}
	rows, _ := buildItems(db.Workspace(user.ID).ID, nodes)
	if err := db.InsertItems(user.ID, rows); err != nil {
		t.Fatal(err)
	}
	return db, user.ID, rows
}

func TestEmbeddedSampleTreeUsesEveryTypeAndNestsPages(t *testing.T) {
	nodes, err := parseTree(sampleTreeJSON)
	if err != nil {
		t.Fatal(err)
	}
	db, userID, rows := seedFake(t, nodes)

	used := map[model.ItemType]bool{}
	for _, it := range rows {
		used[it.Type] = true
	}
	for _, typ := range append([]model.ItemType{model.ItemTypePage}, model.BlockTypes...) {
		if !used[typ] {
			t.Errorf("the sample tree has no %s", typ)
		}
	}

	var underBlock, underPage, deep bool
	for _, it := range rows {
		if it.Type != model.ItemTypePage {
			continue
		}
		switch db.Items[*it.ParentID].Type {
		case model.ItemTypePage:
			underPage = true
		case model.ItemTypeWorkspace:
		default:
			underBlock = true
		}
		if crumbs, _ := db.Ancestors(userID, it.ID); len(crumbs) >= 2 {
			deep = true
		}
	}
	if !underBlock || !underPage || !deep {
		t.Errorf("want child pages under a block (%v), directly under a page (%v), and two levels deep (%v)",
			underBlock, underPage, deep)
	}
}

func TestBuildItemsKeepsChildIDsInStep(t *testing.T) {
	nodes, err := parseTree(sampleTreeJSON)
	if err != nil {
		t.Fatal(err)
	}
	db, userID, rows := seedFake(t, nodes)

	if len(db.Items) != len(rows)+1 {
		t.Fatalf("stored %d items, want %d plus the workspace", len(db.Items), len(rows))
	}
	seen := map[uuid.UUID]bool{}
	for _, it := range rows {
		if it.ParentID == nil || (!seen[*it.ParentID] && db.Items[*it.ParentID].Type != model.ItemTypeWorkspace) {
			t.Fatalf("%s %s comes before its parent", it.Type, it.ID)
		}
		seen[it.ID] = true
	}
	for _, parent := range db.Items {
		var kids []uuid.UUID
		for _, it := range rows {
			if *it.ParentID == parent.ID {
				kids = append(kids, it.ID)
			}
		}
		if len(kids) != len(parent.ChildIDs) || !slices.Equal(kids, parent.ChildIDs) {
			t.Errorf("%s %s: child_ids = %v, want its children in order %v", parent.Type, parent.ID, parent.ChildIDs, kids)
		}
	}

	for _, it := range rows {
		if owner := db.Items[it.ID].UserID; owner != userID {
			t.Errorf("item %s belongs to %s", it.ID, owner)
		}
		if it.Type != model.ItemTypePage {
			continue
		}
		if it.Icon == nil || *it.Icon == "" {
			t.Errorf("page %q has no icon", *it.Name)
		}
		last := db.Items[it.ChildIDs[len(it.ChildIDs)-1]]
		if last.Type != model.ItemTypeParagraph || string(last.Content) != "[]" {
			t.Errorf("page %q does not end with an empty paragraph: %+v", *it.Name, last)
		}
	}
}

func TestSeededPagesListInDocumentOrder(t *testing.T) {
	nodes, err := parseTree(sampleTreeJSON)
	if err != nil {
		t.Fatal(err)
	}
	db, userID, _ := seedFake(t, nodes)

	pages, err := db.ListPages(userID)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, p := range pages {
		got = append(got, p.Name)
	}
	want := []string{
		"Getting Started", "How this app works",
		"Work", "Website Redesign", "Design checklist", "Q4 roadmap", "Weekly sync",
		"Personal", "Reading list", "Travel ideas",
		"Ideas inbox", "Scratchpad",
	}
	if !slices.Equal(got, want) {
		t.Errorf("pages = %v\nwant    %v", got, want)
	}
}

func TestParseTreeRejectsBadFiles(t *testing.T) {
	cases := map[string]string{
		"not json":               `nope`,
		"not a list":             `{"type":"page","name":"x"}`,
		"unknown field":          `[{"type":"page","name":"x","colour":"red"}]`,
		"block at top level":     `[{"type":"paragraph","text":"x"}]`,
		"workspace":              `[{"type":"page","name":"x","children":[{"type":"workspace"}]}]`,
		"unknown type":           `[{"type":"page","name":"x","children":[{"type":"codeBlock"}]}]`,
		"page without name":      `[{"type":"page"}]`,
		"page with text":         `[{"type":"page","name":"x","text":"hi"}]`,
		"block with name":        `[{"type":"page","name":"x","children":[{"type":"quote","name":"y"}]}]`,
		"text and content":       `[{"type":"page","name":"x","children":[{"type":"quote","text":"a","content":[]}]}]`,
		"content not a list":     `[{"type":"page","name":"x","children":[{"type":"quote","content":"a"}]}]`,
		"heading without level":  `[{"type":"page","name":"x","children":[{"type":"heading","text":"a"}]}]`,
		"heading with bad level": `[{"type":"page","name":"x","children":[{"type":"heading","props":{"level":4}}]}]`,
	}
	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := parseTree([]byte(data)); err == nil {
				t.Error("want an error")
			}
		})
	}
	_, err := parseTree([]byte(`[{"type":"page","name":"x","children":[{"type":"page"}]}]`))
	if err == nil || !strings.Contains(err.Error(), "[0].children[0]") {
		t.Errorf("the error should point at the bad entry, got %v", err)
	}
}

func TestBuildItemsDefaultsAndText(t *testing.T) {
	nodes, err := parseTree([]byte(`[{"type":"page","name":"Bare","children":[{"type":"paragraph","text":"hi"}]}]`))
	if err != nil {
		t.Fatal(err)
	}
	rows, ids := buildItems(uuid.New(), nodes)
	if len(rows) != 3 || len(ids) != 1 || rows[0].ID != ids[0] {
		t.Fatalf("rows = %+v, ids = %v; want the page, its paragraph and the trailing paragraph", rows, ids)
	}
	if *rows[0].Icon != defaultPageIcon {
		t.Errorf("icon = %q, want the default", *rows[0].Icon)
	}
	if got := string(rows[1].Content); got != `[{"styles":{},"text":"hi","type":"text"}]` {
		t.Errorf("content = %s", got)
	}
}
