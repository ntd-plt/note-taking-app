package database

import (
	"context"

	user "backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgreFoldersDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreFoldersDataSource(conn *pgxpool.Pool) *PostgreFoldersDataSource {
	return &PostgreFoldersDataSource{conn: conn}
}

func (db *PostgreFoldersDataSource) CreateFolder(folder user.Folder) (user.Folder, error) {
	folder.ID = uuid.New()
	queryString := "INSERT INTO folders (id, parent_folder_id, user_id, name) VALUES ($1, $2, $3, $4) RETURNING created_at, updated_at"
	err := db.conn.QueryRow(context.Background(), queryString, folder.ID, folder.ParentFolderID, folder.UserID, folder.Name).Scan(&folder.CreatedAt, &folder.UpdatedAt)
	if err != nil {
		return user.Folder{}, err
	}
	return folder, nil
}

func (db *PostgreFoldersDataSource) GetFolderByID(id uuid.UUID) (user.Folder, error) {
	var folder user.Folder
	queryString := "SELECT id, parent_folder_id, name, user_id, created_at, updated_at FROM folders WHERE id = $1"
	err := db.conn.QueryRow(context.Background(), queryString, id).Scan(&folder.ID, &folder.ParentFolderID, &folder.Name, &folder.UserID, &folder.CreatedAt, &folder.UpdatedAt)
	if err != nil {
		return user.Folder{}, err
	}
	return folder, nil
}

func (db *PostgreFoldersDataSource) GetFoldersByIDs(ids []uuid.UUID) ([]user.Folder, error) {
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

func (db *PostgreFoldersDataSource) GetFolderChildrenByID(id uuid.UUID) ([]user.Item, error) {
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

func (db *PostgreFoldersDataSource) GetFoldersByUserID(userID uuid.UUID) ([]user.Folder, error) {
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

func (db *PostgreFoldersDataSource) UpdateFolders(folders []user.Folder) error {
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

func (db *PostgreFoldersDataSource) DeleteFolders(ids []uuid.UUID) error {
	queryString := "DELETE FROM folders WHERE id = ANY($1)"
	_, err := db.conn.Exec(context.Background(), queryString, ids)
	return err
}
