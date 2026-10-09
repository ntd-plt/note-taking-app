package database

import (
	"context"
	"errors"
	"strings"

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

	itemColumns = "id, user_id, parent_id, type, name, icon, is_favorite, created_at, updated_at"
)

type PostgreItemsDataSource struct {
	conn *pgxpool.Pool
}

func NewPostgreItemsDataSource(conn *pgxpool.Pool) *PostgreItemsDataSource {
	return &PostgreItemsDataSource{conn: conn}
}

func qualified(alias, columns string) string {
	cols := strings.Split(columns, ", ")
	for i, c := range cols {
		cols[i] = alias + "." + c
	}
	return strings.Join(cols, ", ")
}

func scanItem(row pgx.Row) (model.Item, error) {
	var it model.Item
	err := row.Scan(&it.ID, &it.UserID, &it.ParentID, &it.Type, &it.Name, &it.Icon, &it.IsFavorite, &it.CreatedAt, &it.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return model.Item{}, pkg.NewNotFoundError("item")
	}
	return it, err
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

func depthOf(ctx context.Context, q pgx.Tx, id uuid.UUID) (int, error) {
	var depth int
	err := q.QueryRow(ctx, `
		WITH RECURSIVE up(id, parent_id, depth) AS (
			SELECT id, parent_id, 1 FROM items WHERE id = $1
			UNION ALL
			SELECT i.id, i.parent_id, u.depth + 1 FROM items i JOIN up u ON i.id = u.parent_id
			WHERE u.depth <= $2
		)
		SELECT COALESCE(MAX(depth), 0) FROM up`, id, MaxTreeDepth).Scan(&depth)
	return depth, err
}

func (db *PostgreItemsDataSource) CreateItem(item model.Item, content string) (model.Item, error) {
	ctx := context.Background()
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return model.Item{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}
	created, err := scanItem(tx.QueryRow(ctx, `
		INSERT INTO items (id, user_id, parent_id, type, name, icon, is_favorite)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING `+itemColumns,
		item.ID, item.UserID, item.ParentID, item.Type, item.Name, item.Icon, item.IsFavorite))
	if err != nil {
		return model.Item{}, translateErr(err)
	}

	if item.Type == model.ItemTypeNote {
		if _, err := tx.Exec(ctx, "INSERT INTO note_contents (item_id, content) VALUES ($1, $2)", item.ID, content); err != nil {
			return model.Item{}, translateErr(err)
		}
	}

	if item.ParentID != nil {
		depth, err := depthOf(ctx, tx, item.ID)
		if err != nil {
			return model.Item{}, err
		}
		if depth > MaxTreeDepth {
			return model.Item{}, ErrTooDeep
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return model.Item{}, err
	}
	return created, nil
}

func (db *PostgreItemsDataSource) GetItem(userID, id uuid.UUID) (model.Item, error) {
	return scanItem(db.conn.QueryRow(context.Background(),
		"SELECT "+itemColumns+" FROM items WHERE id = $1 AND user_id = $2", id, userID))
}

func (db *PostgreItemsDataSource) ListItems(userID uuid.UUID, filter model.ItemFilter) ([]model.Item, error) {
	query := "SELECT " + itemColumns + " FROM items WHERE user_id = $1"
	args := []any{userID}
	if filter.ParentSet {
		if filter.ParentID == nil {
			query += " AND parent_id IS NULL"
		} else {
			query += " AND parent_id = $2"
			args = append(args, *filter.ParentID)
		}
	}
	query += " ORDER BY (type <> 'folder'), lower(name), name, created_at, id"

	rows, err := db.conn.Query(context.Background(), query, args...)
	if err != nil {
		return nil, err
	}
	return collectItems(rows)
}

func (db *PostgreItemsDataSource) UpdateItem(userID, id uuid.UUID, patch model.ItemPatch) (model.Item, error) {
	return scanItem(db.conn.QueryRow(context.Background(), `
		UPDATE items
		SET name = COALESCE($3, name),
		    icon = COALESCE($4, icon),
		    is_favorite = COALESCE($5, is_favorite),
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING `+itemColumns,
		id, userID, patch.Name, patch.Icon, patch.IsFavorite))
}

func (db *PostgreItemsDataSource) MoveItems(userID uuid.UUID, moves []model.ItemMove) ([]model.Item, error) {
	ctx := context.Background()
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize concurrent moves by the same user, so the cycle check below cannot
	// be invalidated by another move committing at the same time.
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1::text))", userID.String()); err != nil {
		return nil, err
	}

	ids := make([]uuid.UUID, len(moves))
	parents := make([]*uuid.UUID, len(moves))
	for i, m := range moves {
		ids[i], parents[i] = m.ID, m.ParentID
	}
	rows, err := tx.Query(ctx, `
		UPDATE items AS i
		SET parent_id = u.parent_id, updated_at = NOW()
		FROM (SELECT * FROM UNNEST($1::uuid[], $2::uuid[]) AS t(id, parent_id)) AS u
		WHERE i.id = u.id AND i.user_id = $3
		RETURNING `+qualified("i", itemColumns), ids, parents, userID)
	if err != nil {
		return nil, translateErr(err)
	}
	moved, err := collectItems(rows)
	if err != nil {
		return nil, translateErr(err)
	}
	if len(moved) != len(moves) {
		return nil, ErrMoveConflict
	}

	var cycles int
	err = tx.QueryRow(ctx, `
		WITH RECURSIVE walk(origin, cur, depth) AS (
			SELECT id, parent_id, 1 FROM items WHERE id = ANY($1)
			UNION ALL
			SELECT w.origin, i.parent_id, w.depth + 1 FROM walk w JOIN items i ON i.id = w.cur
			WHERE w.cur <> w.origin AND w.depth <= $2
		)
		SELECT COUNT(*) FROM walk WHERE cur = origin`, ids, MaxTreeDepth).Scan(&cycles)
	if err != nil {
		return nil, err
	}
	if cycles > 0 {
		return nil, ErrMoveConflict
	}

	for _, m := range moved {
		if m.ParentID == nil {
			continue
		}
		depth, err := depthOf(ctx, tx, m.ID)
		if err != nil {
			return nil, err
		}
		if depth > MaxTreeDepth {
			return nil, ErrTooDeep
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return moved, nil
}

func (db *PostgreItemsDataSource) DeleteItem(userID, id uuid.UUID) error {
	tag, err := db.conn.Exec(context.Background(), "DELETE FROM items WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return pkg.NewNotFoundError("item")
	}
	return nil
}

func (db *PostgreItemsDataSource) ApplyDuplicate(plan model.DuplicatePlan) (model.Item, error) {
	ctx := context.Background()
	var root model.Item
	if len(plan.Copies) == 0 {
		return root, ErrMoveConflict
	}

	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return root, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for i, c := range plan.Copies {
		it, err := scanItem(tx.QueryRow(ctx, `
			INSERT INTO items (id, user_id, parent_id, type, name, icon, is_favorite)
			SELECT $1, user_id, $2, type, $3, icon, is_favorite FROM items WHERE id = $4 AND user_id = $5
			RETURNING `+itemColumns,
			c.NewID, c.ParentID, c.Name, c.SourceID, plan.UserID))
		var notFound *pkg.NotFoundError
		if errors.As(err, &notFound) {
			return root, ErrMoveConflict
		}
		if err != nil {
			return root, translateErr(err)
		}
		if i == 0 {
			root = it
		}
		if c.Type == model.ItemTypeNote {
			if _, err := tx.Exec(ctx,
				"INSERT INTO note_contents (item_id, content) SELECT $1, content FROM note_contents WHERE item_id = $2",
				c.NewID, c.SourceID); err != nil {
				return root, translateErr(err)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return root, err
	}
	return root, nil
}

func (db *PostgreItemsDataSource) GetNoteContent(userID, id uuid.UUID) (model.NoteContent, error) {
	var nc model.NoteContent
	err := db.conn.QueryRow(context.Background(), `
		SELECT c.item_id, c.content, c.updated_at
		FROM note_contents c JOIN items i ON i.id = c.item_id
		WHERE c.item_id = $1 AND i.user_id = $2`, id, userID).
		Scan(&nc.ItemID, &nc.Content, &nc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.missingContent(userID, id)
	}
	return nc, err
}

func (db *PostgreItemsDataSource) missingContent(userID, id uuid.UUID) (model.NoteContent, error) {
	it, err := db.GetItem(userID, id)
	if err != nil {
		return model.NoteContent{}, err
	}
	if it.Type != model.ItemTypeNote {
		return model.NoteContent{}, ErrNotANote
	}
	return model.NoteContent{}, pkg.NewNotFoundError("note content")
}

func (db *PostgreItemsDataSource) PutNoteContent(userID, id uuid.UUID, content string) (model.NoteContent, error) {
	ctx := context.Background()
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return model.NoteContent{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var nc model.NoteContent
	err = tx.QueryRow(ctx, `
		UPDATE note_contents AS c
		SET content = $3, updated_at = NOW()
		FROM items i
		WHERE c.item_id = $1 AND i.id = c.item_id AND i.user_id = $2
		RETURNING c.item_id, c.content, c.updated_at`, id, userID, content).
		Scan(&nc.ItemID, &nc.Content, &nc.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return db.missingContent(userID, id)
	}
	if err != nil {
		return model.NoteContent{}, err
	}
	if _, err := tx.Exec(ctx, "UPDATE items SET updated_at = $2 WHERE id = $1", id, nc.UpdatedAt); err != nil {
		return model.NoteContent{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return model.NoteContent{}, err
	}
	return nc, nil
}
