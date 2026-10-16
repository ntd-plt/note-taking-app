package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/google/uuid"
)

// sampleTreeJSON is the sample workspace created for the seeded user. Edit it to change what
// `make seed-user` creates. Each entry is a folder or a note:
//
//	{"type": "folder", "icon": "📁", "name": "…", "children": [ … ]}
//	{"type": "note",   "icon": "📄", "name": "…", "content": "<h1>…</h1><p>…</p>", "favorite": true}
//
// "icon", "content" (HTML, as the editor writes it) and "favorite" are optional; only folders
// have "children"; only notes have "content".
//
//go:embed sample_tree.json
var sampleTreeJSON []byte

type node struct {
	Type     model.ItemType `json:"type"`
	Icon     string         `json:"icon"`
	Name     string         `json:"name"`
	Content  string         `json:"content"`
	Favorite bool           `json:"favorite"`
	Children []node         `json:"children"`
}

func parseTree(data []byte) ([]node, error) {
	var nodes []node
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&nodes); err != nil {
		return nil, fmt.Errorf("sample tree: %w", err)
	}
	if err := validateNodes(nodes, ""); err != nil {
		return nil, fmt.Errorf("sample tree: %w", err)
	}
	return nodes, nil
}

func validateNodes(nodes []node, path string) error {
	for i, n := range nodes {
		where := fmt.Sprintf("%s[%d]", path, i)
		switch {
		case !n.Type.Valid():
			return fmt.Errorf(`%s: "type" must be "note" or "folder"`, where)
		case n.Name == "":
			return fmt.Errorf(`%s: "name" is required`, where)
		case n.Type == model.ItemTypeNote && len(n.Children) > 0:
			return fmt.Errorf("%s (%s): a note cannot have children", where, n.Name)
		case n.Type == model.ItemTypeFolder && n.Content != "":
			return fmt.Errorf("%s (%s): a folder cannot have content", where, n.Name)
		}
		if err := validateNodes(n.Children, fmt.Sprintf("%s.children", where)); err != nil {
			return err
		}
	}
	return nil
}

func defaultIcon(t model.ItemType) string {
	if t == model.ItemTypeFolder {
		return "📁"
	}
	return "📄"
}

// insertTree creates the nodes under parent, parents before children, and returns how many
// items it made.
func insertTree(items database.ItemsDataSource, userID uuid.UUID, parent *uuid.UUID, nodes []node) (int, error) {
	count := 0
	for _, n := range nodes {
		icon := n.Icon
		if icon == "" {
			icon = defaultIcon(n.Type)
		}
		created, err := items.CreateItem(model.Item{
			UserID: userID, ParentID: parent, Type: n.Type, Name: n.Name, Icon: icon, IsFavorite: n.Favorite,
		}, n.Content)
		if err != nil {
			return count, fmt.Errorf("creating %q: %w", n.Name, err)
		}
		count++
		sub, err := insertTree(items, userID, &created.ID, n.Children)
		count += sub
		if err != nil {
			return count, err
		}
	}
	return count, nil
}
