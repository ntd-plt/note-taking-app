package database

import (
	"context"

	user "backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgreNotesDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreNotesDataSource(conn *pgxpool.Pool) *PostgreNotesDataSource {
	return &PostgreNotesDataSource{conn: conn}
}

func (db *PostgreNotesDataSource) CreateNote(note user.Note) (user.Note, error) {
	if note.ID == uuid.Nil {
		note.ID = uuid.New()
	}
	queryString := "INSERT INTO notes (id, folder_id, user_id, title, content) VALUES ($1, $2, $3, $4, $5) RETURNING created_at, updated_at"
	err := db.conn.QueryRow(context.Background(), queryString, note.ID, note.FolderID, note.UserID, note.Title, note.Content).Scan(&note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return user.Note{}, err
	}
	return note, nil
}

func (db *PostgreNotesDataSource) GetNoteByID(id uuid.UUID) (user.Note, error) {
	var note user.Note
	queryString := "SELECT id, folder_id, title, content, user_id, created_at, updated_at FROM notes WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&note.ID, &note.FolderID, &note.Title, &note.Content, &note.UserID, &note.CreatedAt, &note.UpdatedAt)
	if err != nil {
		return user.Note{}, err
	}
	return note, nil
}

func (db *PostgreNotesDataSource) GetNotesByUserID(userID uuid.UUID) ([]user.Note, error) {
	queryString := "SELECT id, folder_id, title, content, user_id, created_at, updated_at FROM notes WHERE user_id = $1"
	rows, err := db.conn.Query(context.Background(), queryString, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notes []user.Note
	for rows.Next() {
		var note user.Note
		if err := rows.Scan(&note.ID, &note.FolderID, &note.Title, &note.Content, &note.UserID, &note.CreatedAt, &note.UpdatedAt); err != nil {
			return nil, err
		}
		notes = append(notes, note)
	}
	return notes, rows.Err()
}

func (db *PostgreNotesDataSource) UpdateNotes(notes []user.Note) error {
	ids := make([]uuid.UUID, len(notes))
	titles := make([]string, len(notes))
	contents := make([]string, len(notes))
	folderIDs := make([]*uuid.UUID, len(notes))
	for i, note := range notes {
		ids[i], titles[i], contents[i], folderIDs[i] = note.ID, note.Title, note.Content, note.FolderID
	}

	queryString := `
		UPDATE notes AS n
		SET title = u.title, content = u.content, folder_id = u.folder_id, updated_at = NOW()
		FROM (SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::uuid[]) AS t(id, title, content, folder_id)) AS u
		WHERE n.id = u.id`
	_, err := db.conn.Exec(context.Background(), queryString, ids, titles, contents, folderIDs)
	return err
}

func (db *PostgreNotesDataSource) DeleteNotes(ids []uuid.UUID) error {
	queryString := "DELETE FROM notes WHERE id = ANY($1)"
	_, err := db.conn.Exec(context.Background(), queryString, ids)
	return err
}
