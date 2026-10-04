package database

import (
	"context"
	"errors"

	user "backend/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PostgreHierarchyDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreHierarchyDataSource(conn *pgxpool.Pool) *PostgreHierarchyDataSource {
	return &PostgreHierarchyDataSource{conn: conn}
}

func (db *PostgreHierarchyDataSource) LoadHierarchy(userID uuid.UUID, probeIDs []uuid.UUID) (user.HierarchySnapshot, error) {
	ctx := context.Background()
	snap := user.HierarchySnapshot{Foreign: map[uuid.UUID]bool{}}

	folderRows, err := db.conn.Query(ctx, "SELECT id, parent_folder_id, name FROM folders WHERE user_id = $1", userID)
	if err != nil {
		return snap, err
	}
	for folderRows.Next() {
		var f user.HierarchyFolderNode
		if err := folderRows.Scan(&f.ID, &f.ParentID, &f.Name); err != nil {
			folderRows.Close()
			return snap, err
		}
		snap.Folders = append(snap.Folders, f)
	}
	folderRows.Close()
	if err := folderRows.Err(); err != nil {
		return snap, err
	}

	noteRows, err := db.conn.Query(ctx, "SELECT id, folder_id, title FROM notes WHERE user_id = $1", userID)
	if err != nil {
		return snap, err
	}
	for noteRows.Next() {
		var n user.HierarchyNoteNode
		if err := noteRows.Scan(&n.ID, &n.FolderID, &n.Title); err != nil {
			noteRows.Close()
			return snap, err
		}
		snap.Notes = append(snap.Notes, n)
	}
	noteRows.Close()
	if err := noteRows.Err(); err != nil {
		return snap, err
	}

	if len(probeIDs) > 0 {
		foreignRows, err := db.conn.Query(ctx, `
			SELECT id FROM folders WHERE id = ANY($2) AND user_id <> $1
			UNION ALL
			SELECT id FROM notes WHERE id = ANY($2) AND user_id <> $1`, userID, probeIDs)
		if err != nil {
			return snap, err
		}
		for foreignRows.Next() {
			var id uuid.UUID
			if err := foreignRows.Scan(&id); err != nil {
				foreignRows.Close()
				return snap, err
			}
			snap.Foreign[id] = true
		}
		foreignRows.Close()
		if err := foreignRows.Err(); err != nil {
			return snap, err
		}
	}
	return snap, nil
}

const (
	folderColumns = "id, parent_folder_id, name, user_id, icon, is_favorite, created_at, updated_at"
	noteColumns   = "id, folder_id, title, content, user_id, icon, is_favorite, created_at, updated_at"
)

func scanFolder(row pgx.Row) (user.Folder, error) {
	var f user.Folder
	err := row.Scan(&f.ID, &f.ParentFolderID, &f.Name, &f.UserID, &f.Icon, &f.IsFavorite, &f.CreatedAt, &f.UpdatedAt)
	return f, err
}

func scanNote(row pgx.Row) (user.Note, error) {
	var n user.Note
	err := row.Scan(&n.ID, &n.FolderID, &n.Title, &n.Content, &n.UserID, &n.Icon, &n.IsFavorite, &n.CreatedAt, &n.UpdatedAt)
	return n, err
}

func (db *PostgreHierarchyDataSource) ApplyMove(plan user.MovePlan) (user.MoveResult, error) {
	ctx := context.Background()
	var result user.MoveResult

	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return result, err
	}
	// Rollback is a no-op once Commit has succeeded.
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize concurrent moves by the same user, so the cycle check below cannot
	// be invalidated by another move committing at the same time.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1::text))", plan.UserID.String()); err != nil {
		return result, err
	}

	// The destination must not have become a descendant of a moved folder.
	if plan.Destination != nil && len(plan.MovedFolders) > 0 {
		var hits int
		err := tx.QueryRow(ctx, `
			WITH RECURSIVE ancestors AS (
				SELECT id, parent_folder_id FROM folders WHERE id = $1
				UNION
				SELECT f.id, f.parent_folder_id FROM folders f JOIN ancestors a ON f.id = a.parent_folder_id
			)
			SELECT COUNT(*) FROM ancestors WHERE id = ANY($2)`,
			*plan.Destination, plan.MovedFolders).Scan(&hits)
		if err != nil {
			return result, err
		}
		if hits > 0 {
			return result, ErrMoveConflict
		}
	}

	if len(plan.MovedFolders) > 0 {
		rows, err := tx.Query(ctx,
			"UPDATE folders SET parent_folder_id = $2, updated_at = NOW() WHERE id = ANY($1) AND user_id = $3 RETURNING "+folderColumns,
			plan.MovedFolders, plan.Destination, plan.UserID)
		if err != nil {
			return result, err
		}
		for rows.Next() {
			f, err := scanFolder(rows)
			if err != nil {
				rows.Close()
				return result, err
			}
			result.MovedFolders = append(result.MovedFolders, f)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return result, err
		}
		if len(result.MovedFolders) != len(plan.MovedFolders) {
			return result, ErrMoveConflict
		}
	}

	if len(plan.MovedNotes) > 0 {
		rows, err := tx.Query(ctx,
			"UPDATE notes SET folder_id = $2, updated_at = NOW() WHERE id = ANY($1) AND user_id = $3 RETURNING "+noteColumns,
			plan.MovedNotes, plan.Destination, plan.UserID)
		if err != nil {
			return result, err
		}
		for rows.Next() {
			n, err := scanNote(rows)
			if err != nil {
				rows.Close()
				return result, err
			}
			result.MovedNotes = append(result.MovedNotes, n)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return result, err
		}
		if len(result.MovedNotes) != len(plan.MovedNotes) {
			return result, ErrMoveConflict
		}
	}

	// Folder clones are ordered parents-first, so each parent exists when its children insert.
	for _, c := range plan.FolderClones {
		f, err := scanFolder(tx.QueryRow(ctx, `
			INSERT INTO folders (id, parent_folder_id, user_id, name, icon, is_favorite)
			SELECT $1, $2, user_id, $3, icon, is_favorite FROM folders WHERE id = $4 AND user_id = $5
			RETURNING `+folderColumns,
			c.NewID, c.ParentID, c.Name, c.SourceID, plan.UserID))
		if errors.Is(err, pgx.ErrNoRows) {
			return result, ErrMoveConflict
		}
		if err != nil {
			return result, err
		}
		result.CreatedFolders = append(result.CreatedFolders, f)
	}

	for _, c := range plan.NoteClones {
		n, err := scanNote(tx.QueryRow(ctx, `
			INSERT INTO notes (id, folder_id, user_id, title, content, icon, is_favorite)
			SELECT $1, $2, user_id, $3, content, icon, is_favorite FROM notes WHERE id = $4 AND user_id = $5
			RETURNING `+noteColumns,
			c.NewID, c.FolderID, c.Title, c.SourceID, plan.UserID))
		if errors.Is(err, pgx.ErrNoRows) {
			return result, ErrMoveConflict
		}
		if err != nil {
			return result, err
		}
		result.CreatedNotes = append(result.CreatedNotes, n)
	}

	if err := tx.Commit(ctx); err != nil {
		return result, err
	}
	return result, nil
}
