package testutil

import (
	"context"
	"fmt"
	"maps"
	"slices"
	"time"

	"backend/internal/apperr"
	"backend/internal/model"
	"backend/internal/tree"

	"github.com/google/uuid"
)

// fakeTreeStore is a tree.Store over the fake's item map. FakeDatabase restores a
// snapshot of the map when a batch fails, which stands in for a rollback.
type fakeTreeStore struct {
	f      *FakeDatabase
	userID uuid.UUID
}

var _ tree.Store = (*fakeTreeStore)(nil)

func (s *fakeTreeStore) Get(id uuid.UUID) (model.Item, error) {
	it, ok := s.f.owned(s.userID, id)
	if !ok {
		return model.Item{}, apperr.NotFoundf("item")
	}
	return it, nil
}

func (s *fakeTreeStore) Descendants(id uuid.UUID) ([]model.Item, error) {
	var out []model.Item
	for queue := []uuid.UUID{id}; len(queue) > 0; queue = queue[1:] {
		for _, it := range s.f.Items {
			if it.ParentID != nil && *it.ParentID == queue[0] && it.UserID == s.userID {
				out = append(out, it)
				queue = append(queue, it.ID)
			}
		}
	}
	return out, nil
}

func (s *fakeTreeStore) Insert(it model.Item) error {
	if _, exists := s.f.Items[it.ID]; exists {
		return apperr.New(apperr.Conflict, "item already exists")
	}
	if it.ParentID != nil {
		if _, ok := s.f.owned(s.userID, *it.ParentID); !ok {
			return fmt.Errorf("parent %s does not exist", *it.ParentID)
		}
	}
	it.UserID = s.userID
	s.f.Items[it.ID] = it
	return nil
}

func (s *fakeTreeStore) Save(it model.Item) error {
	if _, ok := s.f.owned(s.userID, it.ID); !ok {
		return apperr.NotFoundf("item")
	}
	s.f.Items[it.ID] = it
	return nil
}

func (s *fakeTreeStore) Delete(id uuid.UUID) error {
	below, _ := s.Descendants(id)
	for _, it := range below {
		delete(s.f.Items, it.ID)
	}
	delete(s.f.Items, id)
	return nil
}

func (s *fakeTreeStore) Trashed() ([]model.Item, error) {
	var out []model.Item
	for _, it := range s.f.Items {
		if it.UserID == s.userID && it.Type == model.ItemTypePage && it.TrashedAt != nil {
			out = append(out, it)
		}
	}
	slices.SortFunc(out, func(a, b model.Item) int { return slices.Compare(a.ID[:], b.ID[:]) })
	return out, nil
}

func (s *fakeTreeStore) CheckChildIDs(parentIDs []uuid.UUID) error {
	cmp := func(a, b uuid.UUID) int { return slices.Compare(a[:], b[:]) }
	for _, pid := range parentIDs {
		p, ok := s.f.Items[pid]
		if !ok {
			continue
		}
		var live []uuid.UUID
		for _, it := range s.f.Items {
			if it.ParentID != nil && *it.ParentID == pid && it.TrashedAt == nil {
				live = append(live, it.ID)
			}
		}
		listed := slices.Clone(p.ChildIDs)
		slices.SortFunc(live, cmp)
		slices.SortFunc(listed, cmp)
		if !slices.Equal(live, listed) {
			return fmt.Errorf("child_ids of %s out of step: listed %v, children %v", pid, p.ChildIDs, live)
		}
	}
	return nil
}

func (f *FakeDatabase) inTree(ctx context.Context, userID uuid.UUID, fn func(s tree.Store, workspaceID uuid.UUID, now time.Time) error) error {
	// Like a Postgres transaction, nothing runs once the request is canceled.
	if err := ctx.Err(); err != nil {
		return err
	}
	ws, err := f.GetWorkspace(ctx, userID)
	if err != nil {
		return err
	}
	snapshot := maps.Clone(f.Items)
	if err := fn(&fakeTreeStore{f: f, userID: userID}, ws.ID, time.Now()); err != nil {
		f.Items = snapshot
		return err
	}
	return nil
}

func (f *FakeDatabase) ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error {
	if err := f.Errs["ApplyOps"]; err != nil {
		return err
	}
	return f.inTree(ctx, userID, func(s tree.Store, workspaceID uuid.UUID, now time.Time) error {
		return tree.Apply(s, workspaceID, ops, now)
	})
}

func (f *FakeDatabase) ListTrash(ctx context.Context, userID uuid.UUID) ([]model.Item, error) {
	if err := f.Errs["ListTrash"]; err != nil {
		return nil, err
	}
	var pages []model.Item
	err := f.inTree(ctx, userID, func(s tree.Store, _ uuid.UUID, _ time.Time) error {
		var err error
		pages, err = tree.ListTrash(s)
		return err
	})
	return pages, err
}

func (f *FakeDatabase) DeleteFromTrash(ctx context.Context, userID, id uuid.UUID) error {
	if err := f.Errs["DeleteFromTrash"]; err != nil {
		return err
	}
	return f.inTree(ctx, userID, func(s tree.Store, _ uuid.UUID, _ time.Time) error {
		return tree.DeleteFromTrash(s, id)
	})
}

func (f *FakeDatabase) EmptyTrash(ctx context.Context, userID uuid.UUID, before *time.Time) (int, error) {
	if err := f.Errs["EmptyTrash"]; err != nil {
		return 0, err
	}
	var n int
	err := f.inTree(ctx, userID, func(s tree.Store, _ uuid.UUID, _ time.Time) error {
		var err error
		n, err = tree.EmptyTrash(s, before)
		return err
	})
	return n, err
}

func (f *FakeDatabase) Duplicate(ctx context.Context, userID, id uuid.UUID) (model.Item, error) {
	if err := f.Errs["Duplicate"]; err != nil {
		return model.Item{}, err
	}
	var copied model.Item
	err := f.inTree(ctx, userID, func(s tree.Store, workspaceID uuid.UUID, now time.Time) error {
		var err error
		copied, err = tree.Duplicate(s, workspaceID, id, now)
		return err
	})
	return copied, err
}
