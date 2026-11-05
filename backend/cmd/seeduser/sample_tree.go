package main

import (
	"backend/internal/model"
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"maps"

	"github.com/google/uuid"
)

// sampleTreeJSON is the sample workspace created for the seeded user. Edit it to change what
// `make seed-user` creates. The top level is a list of pages; every entry is a page or a block,
// and any entry may have "children":
//
//	{"type": "page", "props": {"name": "…", "icon": "📄", "is_favorite": true}, "children": [ … ]}
//	{"type": "paragraph", "text": "Plain text"}
//	{"type": "heading", "props": {"level": 2}, "text": "…"}
//	{"type": "paragraph", "props": {"content": [{"type": "text", "text": "bold", "styles": {"bold": true}}]}}
//
// Block types use BlockNote's names. "text" is shorthand for props.content holding one
// unstyled text run. Keys a type relies on get their defaults when left out (see
// model.PropRules); a heading needs props.level. Each page gets an empty paragraph at the
// end, as the editor keeps one there.
//
//go:embed sample_tree.json
var sampleTreeJSON []byte

type node struct {
	Type     model.ItemType `json:"type"`
	Props    model.Props    `json:"props"`
	Text     string         `json:"text"`
	Children []node         `json:"children"`
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

// validateNode is stricter than the server: a key the type relies on must be valid
// when it is given, so a typo in the file is not silently replaced by a default.
func validateNode(n node) error {
	if n.Type == model.ItemTypeWorkspace || !n.Type.Valid() {
		return fmt.Errorf(`unknown type %q`, n.Type)
	}
	if n.Text != "" {
		if n.Type == model.ItemTypePage {
			return fmt.Errorf(`page: use props.name, not "text"`)
		}
		if _, ok := n.Props[model.PropContent]; ok {
			return fmt.Errorf(`%s: use "text" or props.content, not both`, n.Type)
		}
	}
	for _, rule := range model.PropRules(n.Type) {
		if v, ok := n.Props[rule.Key]; ok {
			if _, valid := rule.Check(v); !valid {
				return fmt.Errorf(`%s: props.%s is not valid`, n.Type, rule.Key)
			}
		}
	}
	_, err := model.CompleteProps(n.Type, n.Props)
	return err
}

func textContent(text string) []any {
	if text == "" {
		return []any{}
	}
	return []any{map[string]any{"type": "text", "text": text, "styles": map[string]any{}}}
}

func emptyParagraph(parent uuid.UUID) model.Item {
	props, _ := model.CompleteProps(model.ItemTypeParagraph, nil)
	return model.Item{ID: uuid.New(), ParentID: &parent, Type: model.ItemTypeParagraph, Props: props}
}

// buildItems turns validated nodes into items under parent, parents before children,
// with child_ids filled in, and returns them with the ids of the nodes themselves.
func buildItems(parent uuid.UUID, nodes []node) (items []model.Item, ids []uuid.UUID) {
	for _, n := range nodes {
		p := parent
		props := n.Props
		if n.Text != "" {
			props = maps.Clone(n.Props)
			if props == nil {
				props = model.Props{}
			}
			props[model.PropContent] = textContent(n.Text)
		}
		props, _ = model.CompleteProps(n.Type, props)
		it := model.Item{ID: uuid.New(), ParentID: &p, Type: n.Type, Props: props}

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

func createOps(items []model.Item) []model.Op {
	ops := make([]model.Op, len(items))
	for i, it := range items {
		typ := it.Type
		ops[i] = model.Op{Op: model.OpCreate, ID: it.ID, Type: &typ, ParentID: it.ParentID, Props: it.Props}
	}
	return ops
}
