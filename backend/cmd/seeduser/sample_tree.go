package main

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"

	"backend/internal/model"

	"github.com/google/uuid"
)

// sampleTreeJSON is the sample workspace created for the seeded user. Edit it to change what
// `make seed-user` creates. The top level is a list of pages; every entry is a page or a block,
// and any entry may have "children":
//
//	{"type": "page", "icon": "📄", "name": "…", "favorite": true, "children": [ … ]}
//	{"type": "paragraph", "text": "Plain text"}
//	{"type": "heading", "props": {"level": 2}, "text": "…"}
//	{"type": "paragraph", "content": [{"type": "text", "text": "bold", "styles": {"bold": true}}]}
//
// Block types use BlockNote's names. "text" is shorthand for one unstyled text run; use
// "content" (BlockNote inline content) for anything richer. Headings need props.level 1–3.
// Each page gets an empty paragraph at the end, as the editor keeps one there.
//
//go:embed sample_tree.json
var sampleTreeJSON []byte

const defaultPageIcon = "📄"

type node struct {
	Type     model.ItemType  `json:"type"`
	Icon     string          `json:"icon"`
	Name     string          `json:"name"`
	Favorite bool            `json:"favorite"`
	Props    json.RawMessage `json:"props"`
	Text     string          `json:"text"`
	Content  json.RawMessage `json:"content"`
	Children []node          `json:"children"`
}

func parseTree(data []byte) ([]node, error) {
	var nodes []node
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&nodes); err != nil {
		return nil, fmt.Errorf("sample tree: %w", err)
	}
	for i, n := range nodes {
		if n.Type != model.ItemTypePage {
			return nil, fmt.Errorf(`sample tree: [%d]: the top level may only hold pages`, i)
		}
	}
	if err := validateNodes(nodes, ""); err != nil {
		return nil, fmt.Errorf("sample tree: %w", err)
	}
	return nodes, nil
}

func validateNodes(nodes []node, path string) error {
	for i, n := range nodes {
		where := fmt.Sprintf("%s[%d]", path, i)
		if err := validateNode(n); err != nil {
			return fmt.Errorf("%s: %w", where, err)
		}
		if err := validateNodes(n.Children, where+".children"); err != nil {
			return err
		}
	}
	return nil
}

func validateNode(n node) error {
	if n.Type == model.ItemTypePage {
		switch {
		case n.Name == "":
			return fmt.Errorf(`a page needs a "name"`)
		case n.Text != "" || len(n.Content) > 0 || len(n.Props) > 0:
			return fmt.Errorf(`page %q: pages have no "text", "content" or "props"`, n.Name)
		}
		return nil
	}
	if !n.Type.IsBlock() {
		return fmt.Errorf(`unknown type %q`, n.Type)
	}
	if n.Name != "" || n.Icon != "" || n.Favorite {
		return fmt.Errorf(`%s: only pages have "name", "icon" or "favorite"`, n.Type)
	}
	if n.Text != "" && len(n.Content) > 0 {
		return fmt.Errorf(`%s: use "text" or "content", not both`, n.Type)
	}
	if len(n.Content) > 0 {
		var runs []map[string]any
		if err := json.Unmarshal(n.Content, &runs); err != nil {
			return fmt.Errorf(`%s: "content" must be a list of inline content: %v`, n.Type, err)
		}
	}
	var props map[string]any
	if len(n.Props) > 0 {
		if err := json.Unmarshal(n.Props, &props); err != nil {
			return fmt.Errorf(`%s: "props" must be an object: %v`, n.Type, err)
		}
	}
	if n.Type == model.ItemTypeHeading {
		if level, ok := props["level"].(float64); !ok || (level != 1 && level != 2 && level != 3) {
			return fmt.Errorf(`heading: props.level must be 1, 2 or 3`)
		}
	}
	return nil
}

func textContent(text string) json.RawMessage {
	if text == "" {
		return json.RawMessage("[]")
	}
	raw, _ := json.Marshal([]map[string]any{{"type": "text", "text": text, "styles": map[string]any{}}})
	return raw
}

func emptyParagraph(parent uuid.UUID) model.Item {
	return model.Item{
		ID: uuid.New(), ParentID: &parent, Type: model.ItemTypeParagraph,
		Props: json.RawMessage("{}"), Content: json.RawMessage("[]"),
	}
}

// buildItems turns the nodes into items under parent, parents before children, with
// child_ids filled in, and returns them with the ids of the nodes themselves.
func buildItems(parent uuid.UUID, nodes []node) (items []model.Item, ids []uuid.UUID) {
	for _, n := range nodes {
		p := parent
		it := model.Item{ID: uuid.New(), ParentID: &p, Type: n.Type}
		if n.Type == model.ItemTypePage {
			name, icon := n.Name, n.Icon
			if icon == "" {
				icon = defaultPageIcon
			}
			it.Name, it.Icon, it.IsFavorite = &name, &icon, n.Favorite
		} else {
			it.Props = n.Props
			it.Content = n.Content
			if len(it.Content) == 0 {
				it.Content = textContent(n.Text)
			}
		}

		sub, childIDs := buildItems(it.ID, n.Children)
		if n.Type == model.ItemTypePage {
			trailing := emptyParagraph(it.ID)
			sub = append(sub, trailing)
			childIDs = append(childIDs, trailing.ID)
		}
		it.ChildIDs = childIDs
		if it.ChildIDs == nil {
			it.ChildIDs = []uuid.UUID{}
		}

		items = append(items, it)
		items = append(items, sub...)
		ids = append(ids, it.ID)
	}
	return items, ids
}
