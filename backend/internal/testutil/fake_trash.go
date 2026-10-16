package testutil

import (
	"sort"
	"time"

	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/google/uuid"
)

func (f *FakeDatabase) trashed(userID, id uuid.UUID, cutoff time.Time) (model.TrashItem, bool) {
	it, ok := f.Trash[id]
	if !ok || it.UserID != userID || it.DeletedAt.Before(cutoff) {
		return model.TrashItem{}, false
	}
	return it, true
}

func (f *FakeDatabase) TrashItems(userID uuid.UUID, ids []uuid.UUID, trashedAt time.Time) ([]model.TrashItem, error) {
	if err := f.Errs["TrashItems"]; err != nil {
		return nil, err
	}
	doomed := map[uuid.UUID]bool{}
	for _, id := range ids {
		if _, ok := f.owned(userID, id); !ok {
			return nil, pkg.NewNotFoundError("item")
		}
		doomed[id] = true
	}
	for changed := true; changed; {
		changed = false
		for _, it := range f.Items {
			if it.UserID == userID && it.ParentID != nil && doomed[*it.ParentID] && !doomed[it.ID] {
				doomed[it.ID] = true
				changed = true
			}
		}
	}
	if len(doomed) > database.MaxTrashRows {
		return nil, database.ErrTrashTooLarge
	}

	batch := uuid.New()
	trashed := make([]model.TrashItem, 0, len(doomed))
	for id := range doomed {
		it := f.Items[id]
		row := model.TrashItem{
			ID: id, UserID: userID, ParentID: it.ParentID, Type: it.Type, Name: it.Name, Icon: it.Icon,
			CreatedAt: it.CreatedAt, UpdatedAt: it.UpdatedAt, DeletedAt: trashedAt, BatchID: batch,
		}
		if it.Type == model.ItemTypeNote {
			content := f.Contents[id].Content
			row.Content = &content
		}
		f.Trash[id] = row
		trashed = append(trashed, row)
		delete(f.Items, id)
		delete(f.Contents, id)
	}
	sort.Slice(trashed, func(i, j int) bool { return trashed[i].ID.String() < trashed[j].ID.String() })
	return trashed, nil
}

func (f *FakeDatabase) ListTrash(userID uuid.UUID, cutoff time.Time) ([]model.TrashItem, error) {
	if err := f.Errs["ListTrash"]; err != nil {
		return nil, err
	}
	items := []model.TrashItem{}
	for id := range f.Trash {
		if it, ok := f.trashed(userID, id, cutoff); ok {
			items = append(items, it)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if !a.DeletedAt.Equal(b.DeletedAt) {
			return a.DeletedAt.After(b.DeletedAt)
		}
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		return a.ID.String() < b.ID.String()
	})
	return items, nil
}

func (f *FakeDatabase) RestoreItems(userID uuid.UUID, ids []uuid.UUID, cutoff time.Time) ([]model.Item, error) {
	if err := f.Errs["RestoreItems"]; err != nil {
		return nil, err
	}
	set := map[uuid.UUID]model.TrashItem{}
	for _, id := range ids {
		it, ok := f.trashed(userID, id, cutoff)
		if !ok {
			return nil, pkg.NewNotFoundError("item")
		}
		set[id] = it
	}
	for changed := true; changed; {
		changed = false
		for id := range f.Trash {
			it, ok := f.trashed(userID, id, cutoff)
			if !ok || it.ParentID == nil {
				continue
			}
			if parent, in := set[*it.ParentID]; in && parent.BatchID == it.BatchID {
				if _, already := set[id]; !already {
					set[id] = it
					changed = true
				}
			}
		}
	}
	if len(set) > database.MaxTrashRows {
		return nil, database.ErrTrashTooLarge
	}

	parentOf := map[uuid.UUID]*uuid.UUID{}
	for id, it := range set {
		p := it.ParentID
		if p != nil {
			if _, in := set[*p]; !in {
				if parent, live := f.owned(userID, *p); !live || parent.Type != model.ItemTypeFolder {
					p = nil
				}
			}
		}
		parentOf[id] = p
	}
	level := func(id uuid.UUID) int {
		n := 0
		for cur := parentOf[id]; cur != nil && n <= database.MaxTrashRows; cur = parentOf[*cur] {
			n++
		}
		return n
	}
	order := make([]uuid.UUID, 0, len(set))
	for id := range set {
		if _, taken := f.Items[id]; taken {
			return nil, pkg.NewAlreadyExistsError("item")
		}
		order = append(order, id)
	}
	sort.Slice(order, func(i, j int) bool {
		if li, lj := level(order[i]), level(order[j]); li != lj {
			return li < lj
		}
		return order[i].String() < order[j].String()
	})

	restored := make([]model.Item, 0, len(order))
	for _, id := range order {
		row := set[id]
		it := model.Item{
			ID: id, UserID: userID, ParentID: parentOf[id], Type: row.Type, Name: row.Name, Icon: row.Icon,
			CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt,
		}
		f.Items[id] = it
		if row.Type == model.ItemTypeNote && row.Content != nil {
			f.Contents[id] = model.NoteContent{ItemID: id, Content: *row.Content, UpdatedAt: row.UpdatedAt}
		}
		restored = append(restored, it)
	}
	for _, id := range order {
		if f.depthOf(id) > database.MaxTreeDepth {
			for _, undo := range order {
				delete(f.Items, undo)
				delete(f.Contents, undo)
			}
			return nil, database.ErrTooDeep
		}
	}
	for id := range set {
		delete(f.Trash, id)
	}
	return restored, nil
}

func (f *FakeDatabase) DeleteTrashed(userID, id uuid.UUID, cutoff time.Time) error {
	if err := f.Errs["DeleteTrashed"]; err != nil {
		return err
	}
	if _, ok := f.trashed(userID, id, cutoff); !ok {
		return pkg.NewNotFoundError("item")
	}
	doomed := map[uuid.UUID]bool{id: true}
	for changed := true; changed; {
		changed = false
		for _, it := range f.Trash {
			if it.UserID == userID && it.ParentID != nil && doomed[*it.ParentID] && !doomed[it.ID] {
				doomed[it.ID] = true
				changed = true
			}
		}
	}
	for doomedID := range doomed {
		delete(f.Trash, doomedID)
	}
	return nil
}

func (f *FakeDatabase) EmptyTrash(userID uuid.UUID) error {
	if err := f.Errs["EmptyTrash"]; err != nil {
		return err
	}
	for id, it := range f.Trash {
		if it.UserID == userID {
			delete(f.Trash, id)
		}
	}
	return nil
}

func (f *FakeDatabase) PurgeExpired(cutoff time.Time) (int64, error) {
	if err := f.Errs["PurgeExpired"]; err != nil {
		return 0, err
	}
	var n int64
	for id, it := range f.Trash {
		if it.DeletedAt.Before(cutoff) {
			delete(f.Trash, id)
			n++
		}
	}
	return n, nil
}
