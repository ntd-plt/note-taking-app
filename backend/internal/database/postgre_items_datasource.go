package database

import (
	"backend/internal/model"
	"backend/internal/pkg"
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	pgForeignKeyViolation = "23503"
	pgUniqueViolation     = "23505"
	pgCheckViolation      = "23514"

	itemColumns = "i.id, i.user_id, i.parent_id, i.type, i.child_ids, i.props, i.trashed_at, i.created_at, i.updated_at"
)

var (
	ErrInvalidParent = errors.New("parent must be one of your items")
	ErrInvalidItem   = errors.New("item is not valid")
)

type PostgreItemsDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreItemsDataSource(conn *pgxpool.Pool) *PostgreItemsDataSource {
	return &PostgreItemsDataSource{conn: conn}
}

type querier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

func scanItem(row pgx.Row, extra ...any) (model.Item, error) {
	var it model.Item
	dest := append([]any{&it.ID, &it.UserID, &it.ParentID, &it.Type, &it.ChildIDs, &it.Props, &it.TrashedAt, &it.CreatedAt, &it.UpdatedAt}, extra...)
	err := row.Scan(dest...)
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
		case pgCheckViolation:
			return fmt.Errorf("%w: %s", ErrInvalidItem, pgErr.ConstraintName)
		}
	}
	return err
}

func (db *PostgreItemsDataSource) GetWorkspace(ctx context.Context, userID uuid.UUID) (model.Item, error) {
	return scanItem(db.conn.QueryRow(ctx,
		"SELECT "+itemColumns+" FROM items i WHERE i.user_id = $1 AND i.type = 'workspace'", userID))
}

func (db *PostgreItemsDataSource) GetItem(ctx context.Context, userID, id uuid.UUID) (model.Item, error) {
	return getItem(ctx, db.conn, userID, id)
}

func getItem(ctx context.Context, q querier, userID, id uuid.UUID) (model.Item, error) {
	return scanItem(q.QueryRow(ctx,
		"SELECT "+itemColumns+" FROM items i WHERE i.id = $1 AND i.user_id = $2", id, userID))
}

func (db *PostgreItemsDataSource) OpenItem(ctx context.Context, userID, id uuid.UUID) (OpenedItem, error) {
	tx, err := db.conn.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return OpenedItem{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var out OpenedItem
	if out.Location, err = resolveItem(ctx, tx, userID, id); err != nil {
		return OpenedItem{}, err
	}
	if out.Items, err = pageTree(ctx, tx, userID, out.Location.PageID); err != nil {
		return OpenedItem{}, err
	}
	if out.Ancestors, err = ancestors(ctx, tx, userID, out.Location.PageID); err != nil {
		return OpenedItem{}, err
	}
	return out, tx.Commit(ctx)
}

func (db *PostgreItemsDataSource) ResolveItem(ctx context.Context, userID, id uuid.UUID) (model.ItemLocation, error) {
	return resolveItem(ctx, db.conn, userID, id)
}

func resolveItem(ctx context.Context, q querier, userID, id uuid.UUID) (model.ItemLocation, error) {
	var loc model.ItemLocation
	var typ *model.ItemType
	var pageID *uuid.UUID
	err := q.QueryRow(ctx, `
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

func (db *PostgreItemsDataSource) GetPageTree(ctx context.Context, userID, pageID uuid.UUID) ([]model.Item, error) {
	return pageTree(ctx, db.conn, userID, pageID)
}

func pageTree(ctx context.Context, q querier, userID, pageID uuid.UUID) ([]model.Item, error) {
	page, err := getItem(ctx, q, userID, pageID)
	if err != nil {
		return nil, err
	}
	if page.Type != model.ItemTypePage {
		return nil, pkg.NewNotFoundError("page")
	}
	items := []model.Item{page}

	rows, err := q.Query(ctx, `
		WITH RECURSIVE down(id, path) AS (
			SELECT c.id, ARRAY[child_rank(p.child_ids, c.id)]
			FROM items p JOIN items c ON c.parent_id = p.id
			WHERE p.id = $1 AND p.user_id = $2 AND c.trashed_at IS NULL
			UNION ALL
			SELECT c.id, d.path || child_rank(p.child_ids, c.id)
			FROM down d JOIN items p ON p.id = d.id JOIN items c ON c.parent_id = p.id
			WHERE p.type <> 'page' AND c.trashed_at IS NULL AND cardinality(d.path) < $3
		)
		SELECT `+itemColumns+` FROM down d JOIN items i ON i.id = d.id
		ORDER BY d.path, i.created_at, i.id`,
		pageID, userID, MaxTreeDepth)
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

func (db *PostgreItemsDataSource) Ancestors(ctx context.Context, userID, id uuid.UUID) ([]model.Item, error) {
	return ancestors(ctx, db.conn, userID, id)
}

func ancestors(ctx context.Context, q querier, userID, id uuid.UUID) ([]model.Item, error) {
	rows, err := q.Query(ctx, `
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

func (db *PostgreItemsDataSource) ListPages(ctx context.Context, userID uuid.UUID) ([]model.Item, error) {
	// Start from the user's pages (idx_items_user_pages) and walk each one up to the
	// workspace, collecting its position at every level, rather than walking down
	// through every block. A page is left out when it or any item above it is in
	// the trash, or when the walk never reaches the workspace.
	rows, err := db.conn.Query(ctx, `
		WITH RECURSIVE up(page_id, cur, cur_parent, parent_page_id, path, trashed, depth) AS (
			SELECT p.id, p.id, p.parent_id, NULL::uuid, ARRAY[]::int[], p.trashed_at IS NOT NULL, 0
			FROM items p WHERE p.user_id = $1 AND p.type = 'page'
			UNION ALL
			SELECT u.page_id, par.id, par.parent_id,
			       COALESCE(u.parent_page_id, CASE WHEN par.type = 'page' THEN par.id END),
			       child_rank(par.child_ids, u.cur) || u.path,
			       par.trashed_at IS NOT NULL,
			       u.depth + 1
			FROM up u JOIN items par ON par.id = u.cur_parent
			WHERE NOT u.trashed AND u.depth < $2
		)
		SELECT `+itemColumns+`, u.parent_page_id
		FROM up u JOIN items w ON w.id = u.cur AND w.type = 'workspace'
		JOIN items i ON i.id = u.page_id
		ORDER BY u.path, i.created_at, i.id`, userID, MaxTreeDepth)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	pages := []model.Item{}
	for rows.Next() {
		var parentPage *uuid.UUID
		it, err := scanItem(rows, &parentPage)
		if err != nil {
			return nil, err
		}
		it.ParentPageID = parentPage
		pages = append(pages, it)
	}
	return pages, rows.Err()
}
