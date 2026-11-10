// Package tree applies changes to a user's item tree. It holds the rules every
// write must follow (ownership, the trash, positions, cycles, props, and keeping each
// parent's child_ids in step with its children) and runs them against a Store, so
// the Postgres datasource and the in-memory fake behave the same.
package tree

import (
	"encoding/json"
	"errors"
	"maps"
	"reflect"
	"slices"
	"time"

	"backend/internal/apperr"
	"backend/internal/model"

	"github.com/google/uuid"
)

const (
	// MaxTreeDepth bounds how deep an item may sit, and every walk up or down.
	MaxTreeDepth     = 256
	MaxPropsBytes    = 64 << 10
	MaxDuplicateRows = 1000
)

// Store reads and writes one user's items inside a transaction. The caller holds
// the user's tree lock for as long as the Store is used.
type Store interface {
	// Get returns one of the user's items, or an apperr NotFound.
	Get(id uuid.UUID) (model.Item, error)
	// Descendants returns every item below id, at any depth.
	Descendants(id uuid.UUID) ([]model.Item, error)
	// Insert adds a new item; an id already in use gives an apperr Conflict.
	Insert(it model.Item) error
	// Save writes every column of an existing item.
	Save(it model.Item) error
	// Delete removes an item and everything still below it.
	Delete(id uuid.UUID) error
	// Trashed returns the pages in the trash: the ones stamped with trashed_at,
	// not the pages inside them.
	Trashed() ([]model.Item, error)
	// CheckChildIDs fails if any of the parents' child_ids differs from the set
	// of its children that are not in the trash.
	CheckChildIDs(parentIDs []uuid.UUID) error
}

type engine struct {
	s       Store
	ws      model.Item
	now     time.Time
	index   int
	cache   map[uuid.UUID]model.Item
	gone    map[uuid.UUID]bool
	touched map[uuid.UUID]bool
}

func newEngine(s Store, workspaceID uuid.UUID, now time.Time) (*engine, error) {
	e := &engine{s: s, now: now, index: -1, cache: map[uuid.UUID]model.Item{}, gone: map[uuid.UUID]bool{}, touched: map[uuid.UUID]bool{}}
	ws, err := s.Get(workspaceID)
	if err != nil {
		return nil, err
	}
	e.ws = ws
	e.cache[ws.ID] = ws
	return e, nil
}

// fail rejects the current operation; index is -1 outside a batch (Duplicate).
func (e *engine) fail(kind apperr.Kind, format string, args ...any) error {
	err := apperr.New(kind, format, args...)
	if e.index >= 0 {
		return err.AtOp(e.index)
	}
	return err
}

// get returns an item other than the workspace; what names it in errors.
func (e *engine) get(id uuid.UUID, what string) (model.Item, error) {
	if id == e.ws.ID {
		return model.Item{}, e.fail(apperr.NotFound, "%s not found", what)
	}
	return e.getAny(id, what)
}

func (e *engine) getAny(id uuid.UUID, what string) (model.Item, error) {
	if e.gone[id] {
		return model.Item{}, e.fail(apperr.NotFound, "%s not found", what)
	}
	if it, ok := e.cache[id]; ok {
		return it, nil
	}
	it, err := e.s.Get(id)
	if apperr.Is(err, apperr.NotFound) {
		return model.Item{}, e.fail(apperr.NotFound, "%s not found", what)
	}
	if err != nil {
		return model.Item{}, err
	}
	e.cache[id] = it
	return it, nil
}

// chain returns the ids from it up to the workspace, it first. It fails if any of
// them is in the trash, or if the chain is too long.
func (e *engine) chain(it model.Item) ([]uuid.UUID, error) {
	ids := []uuid.UUID{it.ID}
	for it.ParentID != nil {
		if it.TrashedAt != nil {
			return nil, e.fail(apperr.Conflict, "item is in the trash")
		}
		if len(ids) > MaxTreeDepth {
			return nil, e.fail(apperr.Invalid, "items are nested too deeply")
		}
		parent, err := e.getAny(*it.ParentID, "parent")
		if err != nil {
			return nil, err
		}
		it = parent
		ids = append(ids, it.ID)
	}
	return ids, nil
}

func (e *engine) save(it model.Item) error {
	if err := e.s.Save(it); err != nil {
		return err
	}
	e.cache[it.ID] = it
	return nil
}

func (e *engine) checkSize(props model.Props) error {
	raw, err := json.Marshal(props)
	if err != nil {
		return e.fail(apperr.Invalid, "props cannot be stored: %v", err)
	}
	if len(raw) > MaxPropsBytes {
		return e.fail(apperr.Invalid, "props must be at most %d KB", MaxPropsBytes>>10)
	}
	return nil
}

// detach removes id from its parent's child_ids.
func (e *engine) detach(parentID, id uuid.UUID) error {
	parent, err := e.getAny(parentID, "parent")
	if err != nil {
		return err
	}
	parent.ChildIDs = slices.DeleteFunc(slices.Clone(parent.ChildIDs), func(c uuid.UUID) bool { return c == id })
	e.touched[parentID] = true
	return e.save(parent)
}

// attach puts id at index position of the parent's child_ids, counted without id
// itself, or at the end when position is nil. A page added at the end of another
// page goes before that page's trailing empty paragraph, which the editor keeps
// last; callers like the sidebar cannot see the parent's blocks to count it.
func (e *engine) attach(parentID, id uuid.UUID, position *int) error {
	parent, err := e.getAny(parentID, "parent")
	if err != nil {
		return err
	}
	ids := slices.DeleteFunc(slices.Clone(parent.ChildIDs), func(c uuid.UUID) bool { return c == id })
	at := len(ids)
	if position != nil {
		if *position < 0 || *position > len(ids) {
			return e.fail(apperr.Conflict, "position %d is out of range: the parent has %d other children", *position, len(ids))
		}
		at = *position
	} else if parent.Type == model.ItemTypePage && len(ids) > 0 {
		child, err := e.getAny(id, "item")
		if err != nil {
			return err
		}
		if child.Type == model.ItemTypePage {
			last, err := e.getAny(ids[len(ids)-1], "child")
			if err != nil {
				return err
			}
			if isEmptyParagraph(last) {
				at--
			}
		}
	}
	parent.ChildIDs = slices.Insert(ids, at, id)
	e.touched[parentID] = true
	return e.save(parent)
}

func isEmptyParagraph(it model.Item) bool {
	if it.Type != model.ItemTypeParagraph || len(it.ChildIDs) > 0 {
		return false
	}
	content, ok := it.Props[model.PropContent]
	return !ok || content == nil || reflect.ValueOf(content).Kind() == reflect.Slice && reflect.ValueOf(content).Len() == 0
}

// parentFor loads a new parent for an item of type typ and checks it can hold it.
// It returns the parent's chain up to the workspace.
func (e *engine) parentFor(parentID *uuid.UUID, typ model.ItemType) ([]uuid.UUID, error) {
	if parentID == nil {
		return nil, e.fail(apperr.Invalid, "parent_id is required")
	}
	parent, err := e.getAny(*parentID, "parent")
	if err != nil {
		return nil, err
	}
	if parent.ID == e.ws.ID && typ != model.ItemTypePage {
		return nil, e.fail(apperr.Invalid, "only pages can be at the top level")
	}
	chain, err := e.chain(parent)
	if err != nil {
		return nil, err
	}
	if len(chain) >= MaxTreeDepth {
		return nil, e.fail(apperr.Invalid, "items are nested too deeply")
	}
	return chain, nil
}

func (e *engine) finish() error {
	var ids []uuid.UUID
	for id := range e.touched {
		if !e.gone[id] {
			ids = append(ids, id)
		}
	}
	return e.s.CheckChildIDs(ids)
}

// Apply runs the operations in order, each seeing the effects of the ones before
// it. On error the caller must roll the whole batch back.
func Apply(s Store, workspaceID uuid.UUID, ops []model.Op, now time.Time) error {
	e, err := newEngine(s, workspaceID, now)
	if err != nil {
		return err
	}
	for i, op := range ops {
		e.index = i
		var err error
		switch op.Op {
		case model.OpCreate:
			err = e.create(op)
		case model.OpUpdate:
			err = e.update(op)
		case model.OpMove:
			err = e.move(op)
		case model.OpDelete:
			err = e.delete(op)
		case model.OpTrash:
			err = e.trash(op)
		case model.OpRestore:
			err = e.restore(op)
		default:
			err = e.fail(apperr.Invalid, "unknown op %q", op.Op)
		}
		if err != nil {
			return err
		}
	}
	return e.finish()
}

func (e *engine) completeProps(t model.ItemType, props model.Props) (model.Props, error) {
	out, err := model.CompleteProps(t, props)
	var missing *model.MissingPropError
	if errors.As(err, &missing) {
		return nil, e.fail(apperr.Invalid, "%s", missing.Error())
	}
	if err != nil {
		return nil, err
	}
	return out, e.checkSize(out)
}

func (e *engine) create(op model.Op) error {
	if op.Type == nil || *op.Type == model.ItemTypeWorkspace || !op.Type.Valid() {
		return e.fail(apperr.Invalid, "a valid type is required")
	}
	if _, err := e.parentFor(op.ParentID, *op.Type); err != nil {
		return err
	}
	if _, cached := e.cache[op.ID]; cached && !e.gone[op.ID] {
		return e.fail(apperr.Conflict, "item %s already exists", op.ID)
	}
	props, err := e.completeProps(*op.Type, op.Props)
	if err != nil {
		return err
	}

	it := model.Item{
		ID: op.ID, UserID: e.ws.UserID, ParentID: op.ParentID, Type: *op.Type, ChildIDs: []uuid.UUID{},
		Props: props, CreatedAt: e.now, UpdatedAt: e.now,
	}
	err = e.s.Insert(it)
	if apperr.Is(err, apperr.Conflict) {
		return e.fail(apperr.Conflict, "item %s already exists", op.ID)
	}
	if err != nil {
		return err
	}
	delete(e.gone, it.ID)
	e.cache[it.ID] = it
	return e.attach(*op.ParentID, it.ID, op.Position)
}

// mergeProps sets each given key on a copy of current. A null value is skipped,
// and so is a value the type relies on that is not acceptable for that key.
func mergeProps(t model.ItemType, current, changes model.Props) model.Props {
	rules := map[string]model.PropRule{}
	for _, r := range model.PropRules(t) {
		rules[r.Key] = r
	}
	out := maps.Clone(current)
	if out == nil {
		out = model.Props{}
	}
	for k, v := range changes {
		if v == nil {
			continue
		}
		if rule, ok := rules[k]; ok {
			checked, valid := rule.Check(v)
			if !valid {
				continue
			}
			v = checked
		}
		out[k] = v
	}
	return out
}

func (e *engine) update(op model.Op) error {
	it, err := e.get(op.ID, "item")
	if err != nil {
		return err
	}
	if _, err := e.chain(it); err != nil {
		return err
	}
	typ := it.Type
	if op.Type != nil {
		if (*op.Type == model.ItemTypePage) != (it.Type == model.ItemTypePage) {
			return e.fail(apperr.Invalid, "an item cannot change between page and block")
		}
		typ = *op.Type
	}
	props, err := e.completeProps(typ, mergeProps(typ, it.Props, op.Props))
	if err != nil {
		return err
	}
	it.Type, it.Props, it.UpdatedAt = typ, props, e.now
	return e.save(it)
}

func (e *engine) move(op model.Op) error {
	it, err := e.get(op.ID, "item")
	if err != nil {
		return err
	}
	if _, err := e.chain(it); err != nil {
		return err
	}
	parentChain, err := e.parentFor(op.ParentID, it.Type)
	if err != nil {
		return err
	}
	if slices.Contains(parentChain, it.ID) {
		return e.fail(apperr.Conflict, "an item cannot be moved inside itself")
	}
	if err := e.detach(*it.ParentID, it.ID); err != nil {
		return err
	}
	if err := e.attach(*op.ParentID, it.ID, op.Position); err != nil {
		return err
	}
	it.ParentID = op.ParentID
	return e.save(it)
}

// delete removes a block and everything under it. Pages under it are not deleted:
// they go to the trash, taking their own content with them.
func (e *engine) delete(op model.Op) error {
	it, err := e.get(op.ID, "item")
	if err != nil {
		return err
	}
	if it.Type == model.ItemTypePage {
		return e.fail(apperr.Invalid, "pages cannot be deleted here; trash them instead")
	}
	if _, err := e.chain(it); err != nil {
		return err
	}
	below, err := e.s.Descendants(it.ID)
	if err != nil {
		return err
	}
	children := map[uuid.UUID][]model.Item{}
	for _, d := range below {
		children[*d.ParentID] = append(children[*d.ParentID], d)
	}

	removed := []uuid.UUID{it.ID}
	for queue := []uuid.UUID{it.ID}; len(queue) > 0; queue = queue[1:] {
		for _, c := range children[queue[0]] {
			if c.Type == model.ItemTypePage {
				if err := e.toTrash(c); err != nil {
					return err
				}
				continue
			}
			removed = append(removed, c.ID)
			queue = append(queue, c.ID)
		}
	}

	if err := e.detach(*it.ParentID, it.ID); err != nil {
		return err
	}
	if err := e.s.Delete(it.ID); err != nil {
		return err
	}
	for _, id := range removed {
		e.gone[id] = true
		delete(e.cache, id)
	}
	return nil
}

// toTrash moves a page under the workspace and stamps it, leaving it out of the
// workspace's child_ids.
func (e *engine) toTrash(page model.Item) error {
	wsID := e.ws.ID
	page.ParentID = &wsID
	page.TrashedAt = &e.now
	return e.save(page)
}

func (e *engine) trash(op model.Op) error {
	it, err := e.get(op.ID, "item")
	if err != nil {
		return err
	}
	if it.Type != model.ItemTypePage {
		return e.fail(apperr.Invalid, "only pages go to the trash; delete blocks instead")
	}
	if _, err := e.chain(it); err != nil {
		return err
	}
	if err := e.detach(*it.ParentID, it.ID); err != nil {
		return err
	}
	return e.toTrash(it)
}
