package main

import (
	"strings"
	"testing"

	"backend/internal/model"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func countNodes(nodes []node) int {
	n := len(nodes)
	for _, c := range nodes {
		n += countNodes(c.Children)
	}
	return n
}

func TestEmbeddedSampleTreeIsValidAndSized(t *testing.T) {
	nodes, err := parseTree(sampleTreeJSON)
	if err != nil {
		t.Fatal(err)
	}
	if n := countNodes(nodes); n < 10 || n > 20 {
		t.Errorf("the sample tree has %d items, want 10 to 20", n)
	}
}

func TestInsertTreeCreatesParentsBeforeChildren(t *testing.T) {
	nodes, err := parseTree(sampleTreeJSON)
	if err != nil {
		t.Fatal(err)
	}
	db := testutil.NewFakeDatabase()
	user := uuid.New()

	made, err := insertTree(db, user, nil, nodes)
	if err != nil {
		t.Fatal(err)
	}
	if want := countNodes(nodes); made != want || len(db.Items) != want {
		t.Fatalf("created %d, stored %d; want %d", made, len(db.Items), want)
	}
	for _, it := range db.Items {
		if it.UserID != user || it.Icon == "" {
			t.Errorf("item %q = %+v", it.Name, it)
		}
		if it.Type == model.ItemTypeNote && db.Contents[it.ID].Content == "" {
			t.Errorf("note %q has no content", it.Name)
		}
	}
}

func TestParseTreeRejectsBadFiles(t *testing.T) {
	cases := map[string]string{
		"not json":           `nope`,
		"not a list":         `{"type":"note","name":"x"}`,
		"unknown field":      `[{"type":"note","name":"x","colour":"red"}]`,
		"missing type":       `[{"name":"x"}]`,
		"bad type":           `[{"type":"page","name":"x"}]`,
		"missing name":       `[{"type":"note","name":""}]`,
		"note with children": `[{"type":"note","name":"x","children":[{"type":"note","name":"y"}]}]`,
		"folder with body":   `[{"type":"folder","name":"x","content":"<p>hi</p>"}]`,
		"bad nested entry":   `[{"type":"folder","name":"x","children":[{"type":"note"}]}]`,
	}
	for name, data := range cases {
		t.Run(name, func(t *testing.T) {
			if _, err := parseTree([]byte(data)); err == nil {
				t.Error("want an error")
			}
		})
	}
	_, err := parseTree([]byte(`[{"type":"folder","name":"x","children":[{"type":"note"}]}]`))
	if err == nil || !strings.Contains(err.Error(), "[0].children[0]") {
		t.Errorf("the error should point at the bad entry, got %v", err)
	}
}

func TestParseTreeAllowsEmptyFolderAndDefaultIcons(t *testing.T) {
	nodes, err := parseTree([]byte(`[{"type":"folder","name":"Empty"},{"type":"note","name":"Bare"}]`))
	if err != nil {
		t.Fatal(err)
	}
	db := testutil.NewFakeDatabase()
	if _, err := insertTree(db, uuid.New(), nil, nodes); err != nil {
		t.Fatal(err)
	}
	icons := map[string]string{}
	for _, it := range db.Items {
		icons[it.Name] = it.Icon
	}
	if icons["Empty"] != "📁" || icons["Bare"] != "📄" {
		t.Errorf("icons = %v, want the defaults", icons)
	}
}
