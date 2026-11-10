package tree

import (
	"slices"
	"time"

	"backend/internal/apperr"
	"backend/internal/model"

	"github.com/google/uuid"
)

// The trash holds pages only. Trashing a page stamps it with trashed_at and moves
// it under the workspace, out of the workspace's child_ids; the pages inside it are
// not stamped, they are hidden with it and come back with it.

// restore takes a page out of the trash and puts it under parent_id at position,
// or at the end of the workspace when parent_id is left out. The new parent must
// not be in the trash, which also rules out a place inside the page itself.
func (e *engine) restore(op model.Op) error {
	it, err := e.get(op.ID, "item")
	if err != nil {
		return err
	}
	if it.Type != model.ItemTypePage {
		return e.fail(apperr.Invalid, "only pages are restored from the trash")
	}
	if it.TrashedAt == nil {
		if _, err := e.chain(it); err != nil {
			return e.fail(apperr.Conflict, "this page is inside a page in the trash; restore that page instead")
		}
		return e.fail(apperr.Conflict, "page is not in the trash")
	}
	parentID := op.ParentID
	if parentID == nil {
		wsID := e.ws.ID
		parentID = &wsID
	}
	if _, err := e.parentFor(parentID, model.ItemTypePage); err != nil {
		return err
	}
	it.ParentID = parentID
	it.TrashedAt = nil
	if err := e.save(it); err != nil {
		return err
	}
	return e.attach(*parentID, it.ID, op.Position)
}

// ListTrash returns the pages in the trash, the most recently trashed first.
func ListTrash(s Store) ([]model.Item, error) {
	pages, err := s.Trashed()
	if err != nil {
		return nil, err
	}
	slices.SortStableFunc(pages, func(a, b model.Item) int { return b.TrashedAt.Compare(*a.TrashedAt) })
	return pages, nil
}

// DeleteFromTrash removes a page in the trash for good, with everything in it.
func DeleteFromTrash(s Store, id uuid.UUID) error {
	pages, err := s.Trashed()
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(pages, func(p model.Item) bool { return p.ID == id }) {
		return apperr.New(apperr.NotFound, "page is not in the trash")
	}
	return s.Delete(id)
}

// EmptyTrash removes for good every page in the trash that was trashed before
// `before`, or all of them when before is nil. It returns how many it removed.
func EmptyTrash(s Store, before *time.Time) (int, error) {
	pages, err := s.Trashed()
	if err != nil {
		return 0, err
	}
	n := 0
	for _, p := range pages {
		if before != nil && !p.TrashedAt.Before(*before) {
			continue
		}
		if err := s.Delete(p.ID); err != nil {
			return n, err
		}
		n++
	}
	return n, nil
}
