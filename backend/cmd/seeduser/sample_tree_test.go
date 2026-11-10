package main

import (
	"reflect"
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
	if err := db.AddUser(ctx, *user); err != nil {
		t.Fatal(err)
	}
	rows, _ := buildItems(db.Workspace(user.ID).ID, nodes)
	if err := db.ApplyOps(ctx, user.ID, createOps(rows)); err != nil {
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
		if crumbs, _ := db.Ancestors(ctx, userID, it.ID); len(crumbs) >= 2 {
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
		if icon, _ := it.Props["icon"].(string); icon == "" {
			t.Errorf("page %q has no icon", it.Name())
		}
		last := db.Items[it.ChildIDs[len(it.ChildIDs)-1]]
		if content, _ := last.Props["content"].([]any); last.Type != model.ItemTypeParagraph || content == nil || len(content) != 0 {
			t.Errorf("page %q does not end with an empty paragraph: %+v", it.Name(), last)
		}
	}
}

func TestSeededPagesListInDocumentOrder(t *testing.T) {
	nodes, err := parseTree(sampleTreeJSON)
	if err != nil {
		t.Fatal(err)
	}
	db, userID, _ := seedFake(t, nodes)

	pages, err := db.ListPages(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	var got []string
	for _, p := range pages {
		got = append(got, p.Name())
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
		"not a list":             `{"type":"page"}`,
		"unknown field":          `[{"type":"page","name":"x"}]`,
		"block at top level":     `[{"type":"paragraph","text":"x"}]`,
		"workspace":              `[{"type":"page","children":[{"type":"workspace"}]}]`,
		"unknown type":           `[{"type":"page","children":[{"type":"codeBlock"}]}]`,
		"props not an object":    `[{"type":"page","props":[]}]`,
		"page with text":         `[{"type":"page","text":"hi"}]`,
		"blank page name":        `[{"type":"page","props":{"name":"  "}}]`,
		"favorite not a bool":    `[{"type":"page","props":{"is_favorite":"yes"}}]`,
		"text and content":       `[{"type":"page","children":[{"type":"quote","text":"a","props":{"content":[]}}]}]`,
		"content not a list":     `[{"type":"page","children":[{"type":"quote","props":{"content":"a"}}]}]`,
		"heading without level":  `[{"type":"page","children":[{"type":"heading","text":"a"}]}]`,
		"heading with bad level": `[{"type":"page","children":[{"type":"heading","props":{"level":4}}]}]`,
		"checked not a bool":     `[{"type":"page","children":[{"type":"checkListItem","props":{"checked":1}}]}]`,
	}
	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := parseTree([]byte(data)); err == nil {
				t.Error("want an error")
			}
		})
	}
	_, err := parseTree([]byte(`[{"type":"page","children":[{"type":"heading"}]}]`))
	if err == nil || !strings.Contains(err.Error(), "[0].children[0]") {
		t.Errorf("the error should point at the bad entry, got %v", err)
	}
}

func TestBuildItemsDefaultsAndText(t *testing.T) {
	nodes, err := parseTree([]byte(`[{"type":"page","children":[
		{"type":"paragraph","text":"hi","props":{"textColor":"red"}},
		{"type":"checkListItem"}]}]`))
	if err != nil {
		t.Fatal(err)
	}
	rows, ids := buildItems(uuid.New(), nodes)
	if len(rows) != 4 || len(ids) != 1 || rows[0].ID != ids[0] {
		t.Fatalf("rows = %+v, ids = %v; want the page, two blocks and the trailing paragraph", rows, ids)
	}
	want := model.Props{"name": model.DefaultPageName, "icon": model.DefaultPageIcon, "is_favorite": false}
	if !reflect.DeepEqual(rows[0].Props, want) {
		t.Errorf("page props = %v, want the defaults %v", rows[0].Props, want)
	}
	if got := rows[1].Props; got["textColor"] != "red" || !reflect.DeepEqual(got["content"], textContent("hi")) {
		t.Errorf("paragraph props = %v", got)
	}
	if got := rows[2].Props; got["checked"] != false {
		t.Errorf("checklist props = %v, want checked false", got)
	}
}
