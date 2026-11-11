package testutil

import (
	"backend/internal/model"

	"github.com/google/uuid"
)

func Ptr[T any](v T) *T { return &v }

func CreatePage(id, parent uuid.UUID, pos *int, name string) model.Op {
	return model.Op{Op: model.OpCreate, ID: id, Type: Ptr(model.ItemTypePage), ParentID: &parent, Position: pos,
		Props: model.Props{model.PropName: name}}
}

// CreateBlock creates a block holding text; a heading gets level 1.
func CreateBlock(id, parent uuid.UUID, pos *int, typ model.ItemType, text string) model.Op {
	props := model.Props{model.PropContent: model.TextContent(text)}
	if typ == model.ItemTypeHeading {
		props[model.PropLevel] = 1
	}
	return model.Op{Op: model.OpCreate, ID: id, Type: &typ, ParentID: &parent, Position: pos, Props: props}
}
