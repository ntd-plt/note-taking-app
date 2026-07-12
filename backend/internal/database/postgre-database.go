package database

import (
	"backend/internal/configs"
	"context"
	"fmt"

	user "backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type PostgreDatabase struct {
	conn *pgx.Conn
}

func NewPostgreDatabase() *PostgreDatabase {
	return &PostgreDatabase{}
}

func (db *PostgreDatabase) GetUserByEmail(email string) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE email = $1"
	err := db.conn.QueryRow(context.Background(), queryString, email).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreDatabase) GetUserByID(id uuid.UUID) (user.User, error) {
	var u user.User
	queryString := "SELECT id, email, name, password_hash, created_at, updated_at FROM users WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return user.User{}, err
	}
	return u, nil
}

func (db *PostgreDatabase) Connect() error {
	config, err := configs.Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}
	url := fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		config.DBUser, config.DBPass, config.DBHost, config.DBPort, config.DBName)

	conn, err := pgx.Connect(context.Background(), url)
	db.conn = conn

	if err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}
	return nil
}

func (db *PostgreDatabase) Disconnect() error {
	if db.conn != nil {
		return db.conn.Close(context.Background())
	}
	return nil
}

func (db *PostgreDatabase) AddUser(u user.User) error {
	_, err := db.conn.Exec(context.Background(), "INSERT INTO users (id, name, email, password_hash, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)", u.ID, u.Name, u.Email, u.PasswordHash, u.CreatedAt, u.UpdatedAt)
	return err
}

func (db *PostgreDatabase) CreateNote(note user.Note, parentID *uuid.UUID) (user.Note, error) {
	note.ID = uuid.New()
	note.FolderID = parentID
	queryString := "INSERT INTO notes (id, folder_id, user_id, title, content) VALUES ($1, $2, $3, $4, $5) RETURNING created_at, updated_at"
	err := db.conn.QueryRow(context.Background(), queryString, note.ID, parentID, note.UserID, note.Title, note.Content).Scan(&note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return user.Note{}, err
	}
	return note, nil
}

func (db *PostgreDatabase) GetNoteByID(id uuid.UUID) (user.Note, error) {
	var note user.Note
	queryString := "SELECT id, title, content, user_id, created_at, updated_at FROM notes WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&note.ID, &note.Title, &note.Content, &note.UserID, &note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return user.Note{}, err
	}
	return note, nil
}

func (db *PostgreDatabase) GetNotesByUserID(userID uuid.UUID) ([]user.Note, error) {
	queryString := "SELECT id, title, content, user_id, created_at, updated_at FROM notes WHERE user_id = $1"
	rows, err := db.conn.Query(context.Background(), queryString, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []user.Note
	for rows.Next() {
		var note user.Note
		if err := rows.Scan(&note.ID, &note.Title, &note.Content, &note.UserID, &note.CreatedAt, &note.UpdatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	return notes, rows.Err()
}

func (db *PostgreDatabase) UpdateNotes(notes []user.Note) error {
	ids := make([]uuid.UUID, len(notes))
	titles := make([]string, len(notes))
	contents := make([]string, len(notes))
	for i, note := range notes {
		ids[i], titles[i], contents[i] = note.ID, note.Title, note.Content
	}

	queryString := `
		UPDATE notes AS n
		SET title = u.title, content = u.content, updated_at = NOW()
		FROM (SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[]) AS t(id, title, content)) AS u
		WHERE n.id = u.id`
	_, err := db.conn.Exec(context.Background(), queryString, ids, titles, contents)
	return err
}

func (db *PostgreDatabase) DeleteNotes(ids []uuid.UUID) error {
	queryString := "DELETE FROM notes WHERE id = ANY($1)"
	_, err := db.conn.Exec(context.Background(), queryString, ids)
	return err
}

func (db *PostgreDatabase) CreateFolder(folder user.Folder) (user.Folder, error) {
	folder.ID = uuid.New()
	queryString := "INSERT INTO folders (id, parent_folder_id, user_id, name) VALUES ($1, $2, $3, $4) RETURNING created_at, updated_at"
	err := db.conn.QueryRow(context.Background(), queryString, folder.ID, folder.ParentFolderID, folder.UserID, folder.Name).Scan(&folder.CreatedAt, &folder.UpdatedAt)
	if err != nil {
		return user.Folder{}, err
	}
	return folder, nil
}

func (db *PostgreDatabase) GetFolderByID(id uuid.UUID) (user.Folder, error) {
	var folder user.Folder
	queryString := "SELECT id, parent_folder_id, name, user_id, created_at, updated_at FROM folders WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&folder.ID, &folder.ParentFolderID, &folder.Name, &folder.UserID, &folder.CreatedAt, &folder.UpdatedAt)
	if err != nil {
		return user.Folder{}, err
	}
	return folder, nil
}

func (db *PostgreDatabase) GetFoldersByIDs(ids []uuid.UUID) ([]user.Folder, error) {
	queryString := "SELECT id, parent_folder_id, name, user_id, created_at, updated_at FROM folders WHERE id = ANY($1)"
	rows, err := db.conn.Query(context.Background(), queryString, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []user.Folder
	for rows.Next() {
		var folder user.Folder
		if err := rows.Scan(&folder.ID, &folder.ParentFolderID, &folder.Name, &folder.UserID, &folder.CreatedAt, &folder.UpdatedAt); err != nil {
			return nil, err
		}
		folders = append(folders, folder)
	}
	return folders, rows.Err()
}

func (db *PostgreDatabase) GetFolderChildrenByID(id uuid.UUID) ([]user.Item, error) {
	queryString := `
		SELECT id::text, name, 'folder' AS type, updated_at FROM folders WHERE parent_folder_id = $1
		UNION ALL
		SELECT id::text, title AS name, 'note' AS type, updated_at FROM notes WHERE folder_id = $1`
	rows, err := db.conn.Query(context.Background(), queryString, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []user.Item
	for rows.Next() {
		var item user.Item
		if err := rows.Scan(&item.ID, &item.Name, &item.Type, &item.UpdatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (db *PostgreDatabase) GetFoldersByUserID(userID uuid.UUID) ([]user.Folder, error) {
	queryString := "SELECT id, parent_folder_id, name, user_id, created_at, updated_at FROM folders WHERE user_id = $1"
	rows, err := db.conn.Query(context.Background(), queryString, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []user.Folder
	for rows.Next() {
		var folder user.Folder
		if err := rows.Scan(&folder.ID, &folder.ParentFolderID, &folder.Name, &folder.UserID, &folder.CreatedAt, &folder.UpdatedAt); err != nil {
			return nil, err
		}
		folders = append(folders, folder)
	}
	return folders, rows.Err()
}

func (db *PostgreDatabase) UpdateFolders(folders []user.Folder) error {
	ids := make([]uuid.UUID, len(folders))
	names := make([]string, len(folders))
	parentIDs := make([]*uuid.UUID, len(folders))
	for i, folder := range folders {
		ids[i], names[i], parentIDs[i] = folder.ID, folder.Name, folder.ParentFolderID
	}

	queryString := `
		UPDATE folders AS f
		SET name = u.name, parent_folder_id = u.parent_folder_id, updated_at = NOW()
		FROM (SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::uuid[]) AS t(id, name, parent_folder_id)) AS u
		WHERE f.id = u.id`
	_, err := db.conn.Exec(context.Background(), queryString, ids, names, parentIDs)
	return err
}

func (db *PostgreDatabase) DeleteFolders(ids []uuid.UUID) error {
	queryString := "DELETE FROM folders WHERE id = ANY($1)"
	_, err := db.conn.Exec(context.Background(), queryString, ids)
	return err
}
