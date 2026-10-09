// Package testutil provides in-memory fakes for the interfaces used across
// the backend, so handler and service tests can run without Postgres or a
// .env file.
package testutil

import (
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	// ErrUserNotFound is a *pkg.NotFoundError so tests using errors.As
	// against that type see the fake behave the same way the real Postgres
	// datasource does.
	ErrUserNotFound error = pkg.NewNotFoundError("user")
)

// Set Errs["MethodName"] to force that method to fail.
type FakeDatabase struct {
	Users    map[uuid.UUID]model.User
	Items    map[uuid.UUID]model.Item
	Contents map[uuid.UUID]model.NoteContent
	Errs     map[string]error
}

var (
	_ database.UserDataSource  = (*FakeDatabase)(nil)
	_ database.ItemsDataSource = (*FakeDatabase)(nil)
)

func NewFakeDatabase() *FakeDatabase {
	return &FakeDatabase{
		Users:    make(map[uuid.UUID]model.User),
		Items:    make(map[uuid.UUID]model.Item),
		Contents: make(map[uuid.UUID]model.NoteContent),
		Errs:     make(map[string]error),
	}
}

func (f *FakeDatabase) Connect() error    { return f.Errs["Connect"] }
func (f *FakeDatabase) Disconnect() error { return f.Errs["Disconnect"] }

func (f *FakeDatabase) GetUserByEmail(email string) (model.User, error) {
	if err := f.Errs["GetUserByEmail"]; err != nil {
		return model.User{}, err
	}
	for _, u := range f.Users {
		if u.Email == email {
			return u, nil
		}
	}
	return model.User{}, ErrUserNotFound
}

func (f *FakeDatabase) GetUserByID(id uuid.UUID) (model.User, error) {
	if err := f.Errs["GetUserByID"]; err != nil {
		return model.User{}, err
	}
	u, ok := f.Users[id]
	if !ok {
		return model.User{}, ErrUserNotFound
	}
	return u, nil
}

func (f *FakeDatabase) AddUser(user model.User) error {
	if err := f.Errs["AddUser"]; err != nil {
		return err
	}
	f.Users[user.ID] = user
	return nil
}

func (f *FakeDatabase) UpdateUser(user model.User) error {
	if err := f.Errs["UpdateUser"]; err != nil {
		return err
	}
	if _, ok := f.Users[user.ID]; !ok {
		return ErrUserNotFound
	}
	f.Users[user.ID] = user
	return nil
}

func (f *FakeDatabase) owned(userID, id uuid.UUID) (model.Item, bool) {
	it, ok := f.Items[id]
	if !ok || it.UserID != userID {
		return model.Item{}, false
	}
	return it, true
}

func (f *FakeDatabase) depthOf(id uuid.UUID) int {
	n := 0
	for cur := &id; cur != nil && n <= database.MaxTreeDepth+1; {
		it, ok := f.Items[*cur]
		if !ok {
			break
		}
		n++
		cur = it.ParentID
	}
	return n
}

func (f *FakeDatabase) CreateItem(item model.Item, content string) (model.Item, error) {
	if err := f.Errs["CreateItem"]; err != nil {
		return model.Item{}, err
	}
	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}
	if _, taken := f.Items[item.ID]; taken {
		return model.Item{}, pkg.NewAlreadyExistsError("item")
	}
	if item.ParentID != nil {
		parent, ok := f.owned(item.UserID, *item.ParentID)
		if !ok || parent.Type != model.ItemTypeFolder {
			return model.Item{}, database.ErrInvalidParent
		}
	}
	now := time.Now()
	item.CreatedAt, item.UpdatedAt = now, now
	f.Items[item.ID] = item
	if f.depthOf(item.ID) > database.MaxTreeDepth {
		delete(f.Items, item.ID)
		return model.Item{}, database.ErrTooDeep
	}
	if item.Type == model.ItemTypeNote {
		f.Contents[item.ID] = model.NoteContent{ItemID: item.ID, Content: content, UpdatedAt: now}
	}
	return item, nil
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

func (f *FakeDatabase) ListItems(userID uuid.UUID, filter model.ItemFilter) ([]model.Item, error) {
	if err := f.Errs["ListItems"]; err != nil {
		return nil, err
	}
	items := []model.Item{}
	for _, it := range f.Items {
		if it.UserID != userID {
			continue
		}
		if filter.ParentSet && !samePtr(it.ParentID, filter.ParentID) {
			continue
		}
		items = append(items, it)
	}
	model.SortItems(items)
	return items, nil
}

func samePtr(a, b *uuid.UUID) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func (f *FakeDatabase) UpdateItem(userID, id uuid.UUID, patch model.ItemPatch) (model.Item, error) {
	if err := f.Errs["UpdateItem"]; err != nil {
		return model.Item{}, err
	}
	it, ok := f.owned(userID, id)
	if !ok {
		return model.Item{}, pkg.NewNotFoundError("item")
	}
	if patch.Name != nil {
		it.Name = *patch.Name
	}
	if patch.Icon != nil {
		it.Icon = *patch.Icon
	}
	if patch.IsFavorite != nil {
		it.IsFavorite = *patch.IsFavorite
	}
	it.UpdatedAt = time.Now()
	f.Items[id] = it
	return it, nil
}

func (f *FakeDatabase) MoveItems(userID uuid.UUID, moves []model.ItemMove) ([]model.Item, error) {
	if err := f.Errs["MoveItems"]; err != nil {
		return nil, err
	}
	staged := make(map[uuid.UUID]model.Item, len(f.Items))
	for id, it := range f.Items {
		staged[id] = it
	}
	now := time.Now()
	for _, m := range moves {
		it, ok := staged[m.ID]
		if !ok || it.UserID != userID {
			return nil, database.ErrMoveConflict
		}
		if m.ParentID != nil {
			parent, ok := staged[*m.ParentID]
			if !ok || parent.UserID != userID || parent.Type != model.ItemTypeFolder {
				return nil, database.ErrInvalidParent
			}
		}
		it.ParentID, it.UpdatedAt = m.ParentID, now
		staged[m.ID] = it
	}

	committed := f.Items
	f.Items = staged
	for _, m := range moves {
		seen := map[uuid.UUID]bool{}
		for cur := f.Items[m.ID].ParentID; cur != nil; cur = f.Items[*cur].ParentID {
			if *cur == m.ID || seen[*cur] {
				f.Items = committed
				return nil, database.ErrMoveConflict
			}
			seen[*cur] = true
		}
		if f.depthOf(m.ID) > database.MaxTreeDepth {
			f.Items = committed
			return nil, database.ErrTooDeep
		}
	}

	moved := make([]model.Item, 0, len(moves))
	for _, m := range moves {
		moved = append(moved, f.Items[m.ID])
	}
	return moved, nil
}

func (f *FakeDatabase) DeleteItem(userID, id uuid.UUID) error {
	if err := f.Errs["DeleteItem"]; err != nil {
		return err
	}
	if _, ok := f.owned(userID, id); !ok {
		return pkg.NewNotFoundError("item")
	}
	doomed := map[uuid.UUID]bool{id: true}
	for changed := true; changed; {
		changed = false
		for _, it := range f.Items {
			if it.ParentID != nil && doomed[*it.ParentID] && !doomed[it.ID] {
				doomed[it.ID] = true
				changed = true
			}
		}
	}
	for doomedID := range doomed {
		delete(f.Items, doomedID)
		delete(f.Contents, doomedID)
	}
	return nil
}

func (f *FakeDatabase) ApplyDuplicate(plan model.DuplicatePlan) (model.Item, error) {
	if err := f.Errs["ApplyDuplicate"]; err != nil {
		return model.Item{}, err
	}
	for _, c := range plan.Copies {
		if _, ok := f.owned(plan.UserID, c.SourceID); !ok {
			return model.Item{}, database.ErrMoveConflict
		}
	}
	now := time.Now()
	var root model.Item
	for i, c := range plan.Copies {
		src := f.Items[c.SourceID]
		clone := model.Item{
			ID: c.NewID, UserID: plan.UserID, ParentID: c.ParentID, Type: src.Type, Name: c.Name,
			Icon: src.Icon, IsFavorite: src.IsFavorite, CreatedAt: now, UpdatedAt: now,
		}
		f.Items[clone.ID] = clone
		if src.Type == model.ItemTypeNote {
			f.Contents[clone.ID] = model.NoteContent{ItemID: clone.ID, Content: f.Contents[src.ID].Content, UpdatedAt: now}
		}
		if i == 0 {
			root = clone
		}
	}
	return root, nil
}

func (f *FakeDatabase) GetNoteContent(userID, id uuid.UUID) (model.NoteContent, error) {
	if err := f.Errs["GetNoteContent"]; err != nil {
		return model.NoteContent{}, err
	}
	it, ok := f.owned(userID, id)
	if !ok {
		return model.NoteContent{}, pkg.NewNotFoundError("item")
	}
	if it.Type != model.ItemTypeNote {
		return model.NoteContent{}, database.ErrNotANote
	}
	return f.Contents[id], nil
}

func (f *FakeDatabase) PutNoteContent(userID, id uuid.UUID, content string) (model.NoteContent, error) {
	if err := f.Errs["PutNoteContent"]; err != nil {
		return model.NoteContent{}, err
	}
	it, ok := f.owned(userID, id)
	if !ok {
		return model.NoteContent{}, pkg.NewNotFoundError("item")
	}
	if it.Type != model.ItemTypeNote {
		return model.NoteContent{}, database.ErrNotANote
	}
	now := time.Now()
	nc := model.NoteContent{ItemID: id, Content: content, UpdatedAt: now}
	f.Contents[id] = nc
	it.UpdatedAt = now
	f.Items[id] = it
	return nc, nil
}

// FakeHasher is a trivial hash.Hasher: Hash prefixes the password with
// "hashed:", Compare checks that prefix. Deterministic and fast.
type FakeHasher struct {
	HashErr error
}

var _ hash.Hasher = (*FakeHasher)(nil)

func (h *FakeHasher) Hash(password []byte) ([]byte, error) {
	if h.HashErr != nil {
		return nil, h.HashErr
	}
	return append([]byte("hashed:"), password...), nil
}

func (h *FakeHasher) Compare(hash, password []byte) error {
	if string(hash) != "hashed:"+string(password) {
		return errors.New("hash mismatch")
	}
	return nil
}

// FakeEmailValidator is a services.EmailValidator returning a fixed
// Classification/IsDisposable pair, or Err if set (simulating a failed
// verification call so callers can exercise the fail-open path). The zero
// value classifies every email as allowed.
type FakeEmailValidator struct {
	Classification services.EmailVerificationClassification
	IsDisposable   bool
	Err            error
}

var _ services.EmailValidator = (*FakeEmailValidator)(nil)

func (f *FakeEmailValidator) Verify(ctx context.Context, email string) (services.EmailVerificationResult, error) {
	if f.Err != nil {
		return services.EmailVerificationResult{}, f.Err
	}
	return services.EmailVerificationResult{
		Classification: f.Classification,
		IsDisposable:   f.IsDisposable,
	}, nil
}

// FakeTokenService is a services.TokenService that issues predictable tokens
// ("access-token" / "refresh-token") and validates only the tokens it issued,
// resolving them to ValidUserID.
type FakeTokenService struct {
	ValidUserID uuid.UUID

	GenerateAccessErr  error
	GenerateRefreshErr error
	ValidateErr        error
}

var _ services.TokenService = (*FakeTokenService)(nil)

func (s *FakeTokenService) GenerateAccessToken(userID uuid.UUID) (string, error) {
	if s.GenerateAccessErr != nil {
		return "", s.GenerateAccessErr
	}
	return "access-token", nil
}

func (s *FakeTokenService) GenerateRefreshToken(userID uuid.UUID) (string, error) {
	if s.GenerateRefreshErr != nil {
		return "", s.GenerateRefreshErr
	}
	return "refresh-token", nil
}

func (s *FakeTokenService) ValidateAccessToken(tokenString string) (uuid.UUID, error) {
	if s.ValidateErr != nil {
		return uuid.Nil, s.ValidateErr
	}
	if tokenString != "access-token" {
		return uuid.Nil, errors.New("invalid token")
	}
	return s.ValidUserID, nil
}

func (s *FakeTokenService) ValidateRefreshToken(tokenString string) (uuid.UUID, error) {
	if s.ValidateErr != nil {
		return uuid.Nil, s.ValidateErr
	}
	if tokenString != "refresh-token" {
		return uuid.Nil, errors.New("invalid token")
	}
	return s.ValidUserID, nil
}
