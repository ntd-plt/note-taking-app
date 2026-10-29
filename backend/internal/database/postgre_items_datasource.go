package database

import (
	"context"
	"errors"
	"fmt"

	"backend/internal/model"
	"backend/internal/pkg"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	pgForeignKeyViolation = "23503"
	pgUniqueViolation     = "23505"

	itemColumns = "i.id, i.user_id, i.parent_id, i.type, i.child_ids, i.props, i.trashed_at, i.created_at, i.updated_at"

	// unlisted sorts a child its parent's child_ids does not mention after the listed ones.
	unlisted = 2147483647
)

var ErrInvalidParent = errors.New("parent must be one of your items")

type PostgreItemsDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreItemsDataSource(conn *pgxpool.Pool) *PostgreItemsDataSource {
	return &PostgreItemsDataSource{conn: conn}
}

func scanItem(row pgx.Row) (model.Item, error) {
	var it model.Item
	err := row.Scan(&it.ID, &it.UserID, &it.ParentID, &it.Type, &it.ChildIDs, &it.Props, &it.TrashedAt, &it.CreatedAt, &it.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Item{}, pkg.NewNotFoundError("item")
	}
	return it, err
}

func translateErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case pgForeignKeyViolation:
			return ErrInvalidParent
		case pgUniqueViolation:
			return pkg.NewAlreadyExistsError("item")
		}
	}
	return err
}

func (db *PostgreItemsDataSource) GetWorkspace(userID uuid.UUID) (model.Item, error) {
	return scanItem(db.conn.QueryRow(context.Background(),
		"SELECT "+itemColumns+" FROM items i WHERE i.user_id = $1 AND i.type = 'workspace'", userID))
}

func (db *PostgreItemsDataSource) GetItem(userID, id uuid.UUID) (model.Item, error) {
	return scanItem(db.conn.QueryRow(context.Background(),
		"SELECT "+itemColumns+" FROM items i WHERE i.id = $1 AND i.user_id = $2", id, userID))
}

func (db *PostgreItemsDataSource) ResolveItem(userID, id uuid.UUID) (model.ItemLocation, error) {
	loc := model.ItemLocation{ID: id}
	var typ *model.ItemType
	var pageID *uuid.UUID
	err := db.conn.QueryRow(context.Background(), `
		WITH RECURSIVE up(id, parent_id, type, trashed_at, depth) AS (
			SELECT id, parent_id, type, trashed_at, 0 FROM items WHERE id = $1 AND user_id = $2
			UNION ALL
			SELECT i.id, i.parent_id, i.type, i.trashed_at, u.depth + 1
			FROM items i JOIN up u ON i.id = u.parent_id
			WHERE u.depth < $3
		)
		SELECT (SELECT type FROM up WHERE depth = 0),
		       (SELECT id FROM up WHERE type = 'page' ORDER BY depth LIMIT 1),
		       EXISTS (SELECT 1 FROM up WHERE trashed_at IS NOT NULL)`,
		id, userID, MaxTreeDepth).Scan(&typ, &pageID, &loc.InTrash)
	if err != nil {
		return loc, err
	}
	if typ == nil || pageID == nil {
		return loc, pkg.NewNotFoundError("item")
	}
	loc.Type, loc.PageID = *typ, *pageID
	return loc, nil
}

func (db *PostgreItemsDataSource) GetPageTree(userID, pageID uuid.UUID) ([]model.Item, error) {
	ctx := context.Background()
	page, err := db.GetItem(userID, pageID)
	if err != nil {
		return nil, err
	}
	if page.Type != model.ItemTypePage {
		return nil, pkg.NewNotFoundError("page")
	}
	items := []model.Item{page}

	// Walk down in child_ids order, without going into child pages.
	rows, err := db.conn.Query(ctx, `
		WITH RECURSIVE down(id, path) AS (
			SELECT c.id, ARRAY[COALESCE(array_position(p.child_ids, c.id), $3)]
			FROM items p JOIN items c ON c.parent_id = p.id
			WHERE p.id = $1 AND p.user_id = $2
			UNION ALL
			SELECT c.id, d.path || COALESCE(array_position(p.child_ids, c.id), $3)
			FROM down d JOIN items p ON p.id = d.id JOIN items c ON c.parent_id = p.id
			WHERE p.type <> 'page' AND cardinality(d.path) < $4
		)
		SELECT `+itemColumns+` FROM down d JOIN items i ON i.id = d.id
		ORDER BY d.path, i.created_at, i.id`,
		pageID, userID, unlisted, MaxTreeDepth)
	if err != nil {
		return nil, err
	}
	below, err := collectItems(rows)
	if err != nil {
		return nil, err
	}
	return append(items, below...), nil
}

func collectItems(rows pgx.Rows) ([]model.Item, error) {
	defer rows.Close()
	items := []model.Item{}
	for rows.Next() {
		it, err := scanItem(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (db *PostgreItemsDataSource) Ancestors(userID, id uuid.UUID) ([]model.Item, error) {
	rows, err := db.conn.Query(context.Background(), `
		WITH RECURSIVE up(id, depth) AS (
			SELECT parent_id, 1 FROM items WHERE id = $1 AND user_id = $2 AND parent_id IS NOT NULL
			UNION ALL
			SELECT i.parent_id, u.depth + 1 FROM items i JOIN up u ON i.id = u.id
			WHERE i.parent_id IS NOT NULL AND u.depth < $3
		)
		SELECT `+itemColumns+`
		FROM up JOIN items i ON i.id = up.id
		WHERE i.type = 'page'
		ORDER BY up.depth DESC`, id, userID, MaxTreeDepth)
	if err != nil {
		return nil, err
	}
	return collectItems(rows)
}

func (db *PostgreItemsDataSource) ListPages(userID uuid.UUID) ([]model.Item, error) {
	// Trashed pages hang directly off the workspace, so skipping them at the first
	// level hides everything inside them too.
	rows, err := db.conn.Query(context.Background(), `
		WITH RECURSIVE down(id, parent_page_id, path) AS (
			SELECT c.id, NULL::uuid, ARRAY[COALESCE(array_position(w.child_ids, c.id), $2)]
			FROM items w JOIN items c ON c.parent_id = w.id
			WHERE w.user_id = $1 AND w.type = 'workspace' AND c.trashed_at IS NULL
			UNION ALL
			SELECT c.id,
			       CASE WHEN p.type = 'page' THEN p.id ELSE d.parent_page_id END,
			       d.path || COALESCE(array_position(p.child_ids, c.id), $2)
			FROM down d JOIN items p ON p.id = d.id JOIN items c ON c.parent_id = p.id
			WHERE cardinality(d.path) < $3
		)
		SELECT `+itemColumns+`, d.parent_page_id
		FROM down d JOIN items i ON i.id = d.id
		WHERE i.type = 'page'
		ORDER BY d.path, i.created_at, i.id`, userID, unlisted, MaxTreeDepth)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	pages := []model.Item{}
	for rows.Next() {
		var it model.Item
		if err := rows.Scan(&it.ID, &it.UserID, &it.ParentID, &it.Type, &it.ChildIDs, &it.Props, &it.TrashedAt,
			&it.CreatedAt, &it.UpdatedAt, &it.ParentPageID); err != nil {
			return nil, err
		}
		pages = append(pages, it)
	}
	return pages, rows.Err()
}

func (db *PostgreItemsDataSource) InsertItems(userID uuid.UUID, items []model.Item) error {
	ctx := context.Background()
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	inBatch := make(map[uuid.UUID]bool, len(items))
	var attachOrder []uuid.UUID
	attach := map[uuid.UUID][]uuid.UUID{}
	for _, it := range items {
		if it.ParentID == nil || it.Type == model.ItemTypeWorkspace {
			return fmt.Errorf("item %s: only the workspace has no parent, and it is created with the user", it.ID)
		}
		if !inBatch[*it.ParentID] {
			if _, seen := attach[*it.ParentID]; !seen {
				attachOrder = append(attachOrder, *it.ParentID)
			}
			attach[*it.ParentID] = append(attach[*it.ParentID], it.ID)
		}
		inBatch[it.ID] = true
	}

	// Lock the parents the batch hangs off before touching their child_ids.
	for _, parent := range attachOrder {
		var found bool
		err := tx.QueryRow(ctx, "SELECT TRUE FROM items WHERE id = $1 AND user_id = $2 FOR UPDATE", parent, userID).Scan(&found)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidParent
		}
		if err != nil {
			return err
		}
	}

	for _, it := range items {
		childIDs := it.ChildIDs
		if childIDs == nil {
			childIDs = []uuid.UUID{}
		}
		props := it.Props
		if props == nil {
			props = model.Props{}
		}
		_, err := tx.Exec(ctx, `
			INSERT INTO items (id, user_id, parent_id, type, child_ids, props)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			it.ID, userID, it.ParentID, it.Type, childIDs, props)
		if err != nil {
			return translateErr(err)
		}
	}

	for _, parent := range attachOrder {
		if _, err := tx.Exec(ctx,
			"UPDATE items SET child_ids = child_ids || $2::uuid[], updated_at = NOW() WHERE id = $1",
			parent, attach[parent]); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
