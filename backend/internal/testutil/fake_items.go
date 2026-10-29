package testutil

import (
	"fmt"
	"sort"
	"time"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/google/uuid"
)

// The FakeDatabase item methods follow the Postgres datasource: children are
// ordered by their parent's child_ids, and children the parent does not list come
// last, by creation time.

func (f *FakeDatabase) addWorkspace(userID uuid.UUID) model.Item {
	now := time.Now()
	ws := model.Item{
		ID: uuid.New(), UserID: userID, Type: model.ItemTypeWorkspace, ChildIDs: []uuid.UUID{},
		Props: model.Props{}, CreatedAt: now, UpdatedAt: now,
	}
	f.Items[ws.ID] = ws
	return ws
}

// Workspace returns the user's workspace, creating it if the test has not
// added the user through AddUser.
func (f *FakeDatabase) Workspace(userID uuid.UUID) model.Item {
	for _, it := range f.Items {
		if it.UserID == userID && it.Type == model.ItemTypeWorkspace {
			return it
		}
	}
	return f.addWorkspace(userID)
}

func (f *FakeDatabase) owned(userID, id uuid.UUID) (model.Item, bool) {
	it, ok := f.Items[id]
	if !ok || it.UserID != userID {
		return model.Item{}, false
	}
	return it, true
}

func (f *FakeDatabase) children(parent model.Item) []model.Item {
	var kids []model.Item
	for _, it := range f.Items {
		if it.ParentID != nil && *it.ParentID == parent.ID {
			kids = append(kids, it)
		}
	}
	pos := map[uuid.UUID]int{}
	for i, id := range parent.ChildIDs {
		pos[id] = i
	}
	rank := func(it model.Item) int {
		if p, ok := pos[it.ID]; ok {
			return p
		}
		return len(parent.ChildIDs)
	}
	sort.SliceStable(kids, func(i, j int) bool {
		a, b := kids[i], kids[j]
		if ra, rb := rank(a), rank(b); ra != rb {
			return ra < rb
		}
		if !a.CreatedAt.Equal(b.CreatedAt) {
			return a.CreatedAt.Before(b.CreatedAt)
		}
		return a.ID.String() < b.ID.String()
	})
	return kids
}

func (f *FakeDatabase) GetWorkspace(userID uuid.UUID) (model.Item, error) {
	if err := f.Errs["GetWorkspace"]; err != nil {
		return model.Item{}, err
	}
	for _, it := range f.Items {
		if it.UserID == userID && it.Type == model.ItemTypeWorkspace {
			return it, nil
		}
	}
	return model.Item{}, pkg.NewNotFoundError("item")
}

func (f *FakeDatabase) GetItem(userID, id uuid.UUID) (model.Item, error) {
	if err := f.Errs["GetItem"]; err != nil {
		return model.Item{}, err
	}
	it, ok := f.owned(userID, id)
	if !ok {
		return model.Item{}, pkg.NewNotFoundError("item")
	}
	return it, nil
}

func (f *FakeDatabase) ResolveItem(userID, id uuid.UUID) (model.ItemLocation, error) {
	loc := model.ItemLocation{ID: id}
	if err := f.Errs["ResolveItem"]; err != nil {
		return loc, err
	}
	it, ok := f.owned(userID, id)
	if !ok {
		return loc, pkg.NewNotFoundError("item")
	}
	loc.Type = it.Type
	found := false
	for depth := 0; depth <= database.MaxTreeDepth; depth++ {
		if it.TrashedAt != nil {
			loc.InTrash = true
		}
		if it.Type == model.ItemTypePage && !found {
			loc.PageID, found = it.ID, true
		}
		if it.ParentID == nil {
			break
		}
		it = f.Items[*it.ParentID]
	}
	if !found {
		return loc, pkg.NewNotFoundError("item")
	}
	return loc, nil
}

func (f *FakeDatabase) GetPageTree(userID, pageID uuid.UUID) ([]model.Item, error) {
	if err := f.Errs["GetPageTree"]; err != nil {
		return nil, err
	}
	page, ok := f.owned(userID, pageID)
	if !ok || page.Type != model.ItemTypePage {
		return nil, pkg.NewNotFoundError("page")
	}
	items := []model.Item{page}
	var walk func(parent model.Item, depth int)
	walk = func(parent model.Item, depth int) {
		if depth >= database.MaxTreeDepth {
			return
		}
		for _, c := range f.children(parent) {
			items = append(items, c)
			if c.Type != model.ItemTypePage {
				walk(c, depth+1)
			}
		}
	}
	walk(page, 0)
	return items, nil
}

func (f *FakeDatabase) Ancestors(userID, id uuid.UUID) ([]model.Item, error) {
	if err := f.Errs["Ancestors"]; err != nil {
		return nil, err
	}
	pages := []model.Item{}
	it, ok := f.owned(userID, id)
	if !ok {
		return pages, nil
	}
	for depth := 0; it.ParentID != nil && depth < database.MaxTreeDepth; depth++ {
		it = f.Items[*it.ParentID]
		if it.Type == model.ItemTypePage {
			pages = append([]model.Item{it}, pages...)
		}
	}
	return pages, nil
}

func (f *FakeDatabase) ListPages(userID uuid.UUID) ([]model.Item, error) {
	if err := f.Errs["ListPages"]; err != nil {
		return nil, err
	}
	pages := []model.Item{}
	ws, err := f.GetWorkspace(userID)
	if err != nil {
		return pages, nil
	}
	var walk func(parent model.Item, parentPage *uuid.UUID, depth int)
	walk = func(parent model.Item, parentPage *uuid.UUID, depth int) {
		if depth >= database.MaxTreeDepth {
			return
		}
		for _, c := range f.children(parent) {
			if c.TrashedAt != nil {
				continue
			}
			next := parentPage
			if c.Type == model.ItemTypePage {
				c.ParentPageID = parentPage
				pages = append(pages, c)
				id := c.ID
				next = &id
			}
			walk(c, next, depth+1)
		}
	}
	walk(ws, nil, 0)
	return pages, nil
}

func (f *FakeDatabase) InsertItems(userID uuid.UUID, items []model.Item) error {
	if err := f.Errs["InsertItems"]; err != nil {
		return err
	}
	inBatch := map[uuid.UUID]bool{}
	var attachOrder []uuid.UUID
	attach := map[uuid.UUID][]uuid.UUID{}
	for _, it := range items {
		if it.ParentID == nil || it.Type == model.ItemTypeWorkspace {
			return fmt.Errorf("item %s: only the workspace has no parent, and it is created with the user", it.ID)
		}
		if _, exists := f.Items[it.ID]; exists || inBatch[it.ID] {
			return pkg.NewAlreadyExistsError("item")
		}
		if !inBatch[*it.ParentID] {
			if _, ok := f.owned(userID, *it.ParentID); !ok {
				return database.ErrInvalidParent
			}
			if _, seen := attach[*it.ParentID]; !seen {
				attachOrder = append(attachOrder, *it.ParentID)
			}
			attach[*it.ParentID] = append(attach[*it.ParentID], it.ID)
		}
		inBatch[it.ID] = true
	}

	now := time.Now()
	for _, it := range items {
		it.UserID = userID
		if it.ChildIDs == nil {
			it.ChildIDs = []uuid.UUID{}
		}
		if it.Props == nil {
			it.Props = model.Props{}
		}
		it.CreatedAt, it.UpdatedAt = now, now
		f.Items[it.ID] = it
	}
	for _, parent := range attachOrder {
		p := f.Items[parent]
		p.ChildIDs = append(append([]uuid.UUID{}, p.ChildIDs...), attach[parent]...)
		p.UpdatedAt = now
		f.Items[parent] = p
	}
	return nil
}
