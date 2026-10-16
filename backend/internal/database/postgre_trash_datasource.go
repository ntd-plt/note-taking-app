package database

import (
	"context"
	"errors"
	"sort"
	"time"

	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const trashColumns = "id, user_id, parent_id, type, name, icon, created_at, updated_at, deleted_at, batch_id"

type PostgreTrashDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreTrashDataSource(conn *pgxpool.Pool) *PostgreTrashDataSource {
	return &PostgreTrashDataSource{conn: conn}
}

var _ TrashDataSource = (*PostgreTrashDataSource)(nil)

func scanTrash(row pgx.Row, withContent bool) (model.TrashItem, error) {
	var it model.TrashItem
	dest := []any{&it.ID, &it.UserID, &it.ParentID, &it.Type, &it.Name, &it.Icon, &it.CreatedAt, &it.UpdatedAt, &it.DeletedAt, &it.BatchID}
	if withContent {
		dest = append(dest, &it.Content)
	}
	err := row.Scan(dest...)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.TrashItem{}, pkg.NewNotFoundError("item")
	}
	return it, err
}

func collectTrash(rows pgx.Rows, withContent bool) ([]model.TrashItem, error) {
	defer rows.Close()
	items := []model.TrashItem{}
	for rows.Next() {
		it, err := scanTrash(rows, withContent)
		if err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// lockUser serializes tree changes by one user, the same lock MoveItems takes.
func lockUser(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1::text))", userID.String())
	return err
}

func (db *PostgreTrashDataSource) TrashItems(userID uuid.UUID, ids []uuid.UUID, trashedAt time.Time) ([]model.TrashItem, error) {
	ctx := context.Background()
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockUser(ctx, tx, userID); err != nil {
		return nil, err
	}

	var found int
	if err := tx.QueryRow(ctx, "SELECT COUNT(*) FROM items WHERE user_id = $1 AND id = ANY($2)", userID, ids).Scan(&found); err != nil {
		return nil, err
	}
	if found != len(ids) {
		return nil, pkg.NewNotFoundError("item")
	}

	rows, err := tx.Query(ctx, `
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM items WHERE user_id = $1 AND id = ANY($2)
			UNION
			SELECT i.id FROM items i JOIN sub s ON i.parent_id = s.id WHERE i.user_id = $1
		)
		SELECT id FROM sub LIMIT $3`, userID, ids, MaxTrashRows+1)
	if err != nil {
		return nil, err
	}
	var subtree []uuid.UUID
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		subtree = append(subtree, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(subtree) > MaxTrashRows {
		return nil, ErrTrashTooLarge
	}

	moved, err := tx.Query(ctx, `
		INSERT INTO trash_items (`+trashColumns+`, content)
		SELECT i.id, i.user_id, i.parent_id, i.type, i.name, i.icon, i.created_at, i.updated_at, $2, $3,
		       CASE WHEN i.type = 'note' THEN COALESCE(c.content, '') END
		FROM items i LEFT JOIN note_contents c ON c.item_id = i.id
		WHERE i.user_id = $1 AND i.id = ANY($4)
		RETURNING `+trashColumns, userID, trashedAt, uuid.New(), subtree)
	if err != nil {
		return nil, translateErr(err)
	}
	trashed, err := collectTrash(moved, false)
	if err != nil {
		return nil, translateErr(err)
	}
	if _, err := tx.Exec(ctx, "DELETE FROM items WHERE user_id = $1 AND id = ANY($2)", userID, subtree); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return trashed, nil
}

func (db *PostgreTrashDataSource) ListTrash(userID uuid.UUID, cutoff time.Time) ([]model.TrashItem, error) {
	rows, err := db.conn.Query(context.Background(),
		"SELECT "+trashColumns+" FROM trash_items WHERE user_id = $1 AND deleted_at >= $2 ORDER BY deleted_at DESC, name, id",
		userID, cutoff)
	if err != nil {
		return nil, err
	}
	return collectTrash(rows, false)
}

func (db *PostgreTrashDataSource) RestoreItems(userID uuid.UUID, ids []uuid.UUID, cutoff time.Time) ([]model.Item, error) {
	ctx := context.Background()
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockUser(ctx, tx, userID); err != nil {
		return nil, err
	}

	var found int
	if err := tx.QueryRow(ctx,
		"SELECT COUNT(*) FROM trash_items WHERE user_id = $1 AND id = ANY($2) AND deleted_at >= $3",
		userID, ids, cutoff).Scan(&found); err != nil {
		return nil, err
	}
	if found != len(ids) {
		return nil, pkg.NewNotFoundError("item")
	}

	rows, err := tx.Query(ctx, `
		WITH RECURSIVE sub(id, batch_id) AS (
			SELECT id, batch_id FROM trash_items WHERE user_id = $1 AND id = ANY($2)
			UNION
			SELECT t.id, t.batch_id FROM trash_items t
			JOIN sub s ON t.parent_id = s.id AND t.batch_id = s.batch_id
			WHERE t.user_id = $1 AND t.deleted_at >= $3
		)
		SELECT `+qualified("t", trashColumns)+`, t.content FROM trash_items t JOIN sub s ON s.id = t.id LIMIT $4`,
		userID, ids, cutoff, MaxTrashRows+1)
	if err != nil {
		return nil, err
	}
	set, err := collectTrash(rows, true)
	if err != nil {
		return nil, err
	}
	if len(set) > MaxTrashRows {
		return nil, ErrTrashTooLarge
	}

	inSet := make(map[uuid.UUID]model.TrashItem, len(set))
	for _, it := range set {
		inSet[it.ID] = it
	}
	var outside []uuid.UUID
	for _, it := range set {
		if it.ParentID != nil {
			if _, ok := inSet[*it.ParentID]; !ok {
				outside = append(outside, *it.ParentID)
			}
		}
	}
	liveParents := map[uuid.UUID]bool{}
	if len(outside) > 0 {
		prows, err := tx.Query(ctx, "SELECT id FROM items WHERE user_id = $1 AND type = 'folder' AND id = ANY($2)", userID, outside)
		if err != nil {
			return nil, err
		}
		for prows.Next() {
			var id uuid.UUID
			if err := prows.Scan(&id); err != nil {
				prows.Close()
				return nil, err
			}
			liveParents[id] = true
		}
		prows.Close()
		if err := prows.Err(); err != nil {
			return nil, err
		}
	}

	parentOf := make(map[uuid.UUID]*uuid.UUID, len(set))
	hasChild := map[uuid.UUID]bool{}
	for _, it := range set {
		p := it.ParentID
		if p != nil {
			if _, ok := inSet[*p]; !ok && !liveParents[*p] {
				p = nil
			}
		}
		parentOf[it.ID] = p
		if p != nil {
			hasChild[*p] = true
		}
	}
	level := func(id uuid.UUID) int {
		n := 0
		for cur := parentOf[id]; cur != nil && n <= MaxTrashRows; cur = parentOf[*cur] {
			n++
		}
		return n
	}
	sort.SliceStable(set, func(i, j int) bool { return level(set[i].ID) < level(set[j].ID) })

	restored := make([]model.Item, 0, len(set))
	for _, it := range set {
		item, err := scanItem(tx.QueryRow(ctx, `
			INSERT INTO items (id, user_id, parent_id, type, name, icon, is_favorite, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8)
			RETURNING `+itemColumns,
			it.ID, userID, parentOf[it.ID], it.Type, it.Name, it.Icon, it.CreatedAt, it.UpdatedAt))
		if err != nil {
			return nil, translateErr(err)
		}
		if it.Type == model.ItemTypeNote {
			content := ""
			if it.Content != nil {
				content = *it.Content
			}
			if _, err := tx.Exec(ctx, "INSERT INTO note_contents (item_id, content) VALUES ($1, $2)", it.ID, content); err != nil {
				return nil, translateErr(err)
			}
		}
		restored = append(restored, item)
	}

	for _, it := range restored {
		if it.ParentID == nil || hasChild[it.ID] {
			continue
		}
		depth, err := depthOf(ctx, tx, it.ID)
		if err != nil {
			return nil, err
		}
		if depth > MaxTreeDepth {
			return nil, ErrTooDeep
		}
	}

	if _, err := tx.Exec(ctx, "DELETE FROM trash_items WHERE user_id = $1 AND id = ANY($2)", userID, idsOf(set)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return restored, nil
}

func idsOf(items []model.TrashItem) []uuid.UUID {
	ids := make([]uuid.UUID, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}
	return ids
}

func (db *PostgreTrashDataSource) DeleteTrashed(userID, id uuid.UUID, cutoff time.Time) error {
	tag, err := db.conn.Exec(context.Background(), `
		WITH RECURSIVE sub(id) AS (
			SELECT id FROM trash_items WHERE user_id = $1 AND id = $2 AND deleted_at >= $3
			UNION
			SELECT t.id FROM trash_items t JOIN sub s ON t.parent_id = s.id WHERE t.user_id = $1
		)
		DELETE FROM trash_items WHERE id IN (SELECT id FROM sub)`, userID, id, cutoff)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pkg.NewNotFoundError("item")
	}
	return nil
}

func (db *PostgreTrashDataSource) EmptyTrash(userID uuid.UUID) error {
	_, err := db.conn.Exec(context.Background(), "DELETE FROM trash_items WHERE user_id = $1", userID)
	return err
}

func (db *PostgreTrashDataSource) PurgeExpired(cutoff time.Time) (int64, error) {
	tag, err := db.conn.Exec(context.Background(), "DELETE FROM trash_items WHERE deleted_at < $1", cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}
