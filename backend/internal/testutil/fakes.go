// Package testutil provides in-memory fakes for the interfaces used across
// the backend, so handler and service tests can run without Postgres or a
// .env file.
package testutil

import (
	"backend/internal/database"
	"backend/internal/model"
	"backend/internal/pkg/hash"
	"backend/internal/services"
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrUserNotFound   = errors.New("user not found")
	ErrNoteNotFound   = errors.New("note not found")
	ErrFolderNotFound = errors.New("folder not found")
)

// FakeDatabase is an in-memory implementation of database.Database.
// Set Errs["MethodName"] to force that method to fail.
type FakeDatabase struct {
	Users   map[uuid.UUID]model.User
	Notes   map[uuid.UUID]model.Note
	Folders map[uuid.UUID]model.Folder
	Errs    map[string]error
}

var _ database.Database = (*FakeDatabase)(nil)

func NewFakeDatabase() *FakeDatabase {
	return &FakeDatabase{
		Users:   make(map[uuid.UUID]model.User),
		Notes:   make(map[uuid.UUID]model.Note),
		Folders: make(map[uuid.UUID]model.Folder),
		Errs:    make(map[string]error),
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

func (f *FakeDatabase) CreateNote(note model.Note) (model.Note, error) {
	if err := f.Errs["CreateNote"]; err != nil {
		return model.Note{}, err
	}
	if note.ID == uuid.Nil {
		note.ID = uuid.New()
	}
	note.CreatedAt = time.Now()
	note.UpdatedAt = time.Now()
	f.Notes[note.ID] = note
	return note, nil
}

func (f *FakeDatabase) GetNoteByID(id uuid.UUID) (model.Note, error) {
	if err := f.Errs["GetNoteByID"]; err != nil {
		return model.Note{}, err
	}
	n, ok := f.Notes[id]
	if !ok {
		return model.Note{}, ErrNoteNotFound
	}
	return n, nil
}

func (f *FakeDatabase) GetNotesByUserID(userID uuid.UUID) ([]model.Note, error) {
	if err := f.Errs["GetNotesByUserID"]; err != nil {
		return nil, err
	}
	notes := []model.Note{}
	for _, n := range f.Notes {
		if n.UserID == userID {
			notes = append(notes, n)
		}
	}
	return notes, nil
}

func (f *FakeDatabase) UpdateNotes(notes []model.Note) error {
	if err := f.Errs["UpdateNotes"]; err != nil {
		return err
	}
	for _, n := range notes {
		if _, ok := f.Notes[n.ID]; !ok {
			return ErrNoteNotFound
		}
		n.UpdatedAt = time.Now()
		f.Notes[n.ID] = n
	}
	return nil
}

func (f *FakeDatabase) DeleteNotes(ids []uuid.UUID) error {
	if err := f.Errs["DeleteNotes"]; err != nil {
		return err
	}
	for _, id := range ids {
		delete(f.Notes, id)
	}
	return nil
}

func (f *FakeDatabase) CreateFolder(folder model.Folder) (model.Folder, error) {
	if err := f.Errs["CreateFolder"]; err != nil {
		return model.Folder{}, err
	}
	if folder.ID == uuid.Nil {
		folder.ID = uuid.New()
	}
	folder.CreatedAt = time.Now()
	folder.UpdatedAt = time.Now()
	f.Folders[folder.ID] = folder
	return folder, nil
}

func (f *FakeDatabase) GetFolderByID(id uuid.UUID) (model.Folder, error) {
	if err := f.Errs["GetFolderByID"]; err != nil {
		return model.Folder{}, err
	}
	folder, ok := f.Folders[id]
	if !ok {
		return model.Folder{}, ErrFolderNotFound
	}
	return folder, nil
}

func (f *FakeDatabase) GetFolderChildrenByID(id uuid.UUID) ([]model.Item, error) {
	if err := f.Errs["GetFolderChildrenByID"]; err != nil {
		return nil, err
	}
	items := []model.Item{}
	for _, folder := range f.Folders {
		if folder.ParentFolderID != nil && *folder.ParentFolderID == id {
			items = append(items, model.Item{ID: folder.ID.String(), Name: folder.Name, Type: "folder", UpdatedAt: folder.UpdatedAt})
		}
	}
	for _, note := range f.Notes {
		if note.FolderID != nil && *note.FolderID == id {
			items = append(items, model.Item{ID: note.ID.String(), Name: note.Title, Type: "note", UpdatedAt: note.UpdatedAt})
		}
	}
	return items, nil
}

func (f *FakeDatabase) GetFoldersByUserID(userID uuid.UUID) ([]model.Folder, error) {
	if err := f.Errs["GetFoldersByUserID"]; err != nil {
		return nil, err
	}
	folders := []model.Folder{}
	for _, folder := range f.Folders {
		if folder.UserID == userID {
			folders = append(folders, folder)
		}
	}
	return folders, nil
}

func (f *FakeDatabase) GetFoldersByIDs(ids []uuid.UUID) ([]model.Folder, error) {
	if err := f.Errs["GetFoldersByIDs"]; err != nil {
		return nil, err
	}
	folders := []model.Folder{}
	for _, id := range ids {
		if folder, ok := f.Folders[id]; ok {
			folders = append(folders, folder)
		}
	}
	return folders, nil
}

func (f *FakeDatabase) UpdateFolders(folders []model.Folder) error {
	if err := f.Errs["UpdateFolders"]; err != nil {
		return err
	}
	for _, folder := range folders {
		if _, ok := f.Folders[folder.ID]; !ok {
			return ErrFolderNotFound
		}
		folder.UpdatedAt = time.Now()
		f.Folders[folder.ID] = folder
	}
	return nil
}

func (f *FakeDatabase) DeleteFolders(ids []uuid.UUID) error {
	if err := f.Errs["DeleteFolders"]; err != nil {
		return err
	}
	for _, id := range ids {
		delete(f.Folders, id)
	}
	return nil
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
