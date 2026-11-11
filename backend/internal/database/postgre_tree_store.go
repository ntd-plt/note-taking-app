package database

import (
	"context"
	"fmt"
	"time"

	"backend/internal/model"
	"backend/internal/tree"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// lockTree serializes every write to one user's tree for the rest of the
// transaction, so the checks in package tree see a stable tree.
func lockTree(ctx context.Context, tx pgx.Tx, userID uuid.UUID) error {
	_, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtext($1))", "items:"+userID.String())
	return err
}

// pgTreeStore is a tree.Store over one transaction.
type pgTreeStore struct {
	ctx    context.Context
	tx     pgx.Tx
	userID uuid.UUID
}

var _ tree.Store = (*pgTreeStore)(nil)

func (s *pgTreeStore) Get(id uuid.UUID) (model.Item, error) {
	return scanItem(s.tx.QueryRow(s.ctx,
		"SELECT "+itemColumns+" FROM items i WHERE i.id = $1 AND i.user_id = $2", id, s.userID))
}

func (s *pgTreeStore) Descendants(id uuid.UUID) ([]model.Item, error) {
	rows, err := s.tx.Query(s.ctx, `
		WITH RECURSIVE down(id, depth) AS (
			SELECT id, 1 FROM items WHERE parent_id = $1 AND user_id = $2
			UNION ALL
			SELECT i.id, d.depth + 1 FROM items i JOIN down d ON i.parent_id = d.id
			WHERE d.depth < $3
		)
		SELECT `+itemColumns+` FROM down d JOIN items i ON i.id = d.id`, id, s.userID, MaxTreeDepth)
	if err != nil {
		return nil, err
	}
	return collectItems(rows)
}

func (s *pgTreeStore) Insert(it model.Item) error {
	_, err := s.tx.Exec(s.ctx, `
		INSERT INTO items (id, user_id, parent_id, type, child_ids, props, trashed_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		it.ID, s.userID, it.ParentID, it.Type, it.ChildIDs, it.Props, it.TrashedAt, it.CreatedAt, it.UpdatedAt)
	return translateErr(err)
}

func (s *pgTreeStore) Save(it model.Item) error {
	_, err := s.tx.Exec(s.ctx, `
		UPDATE items
		SET parent_id = $3, type = $4, child_ids = $5, props = $6, trashed_at = $7, updated_at = $8
		WHERE id = $1 AND user_id = $2`,
		it.ID, s.userID, it.ParentID, it.Type, it.ChildIDs, it.Props, it.TrashedAt, it.UpdatedAt)
	return translateErr(err)
}

func (s *pgTreeStore) Delete(id uuid.UUID) error {
	_, err := s.tx.Exec(s.ctx, "DELETE FROM items WHERE id = $1 AND user_id = $2", id, s.userID)
	return err
}

func (s *pgTreeStore) DeleteMany(ids []uuid.UUID) error {
	_, err := s.tx.Exec(s.ctx, "DELETE FROM items WHERE id = ANY($1) AND user_id = $2", ids, s.userID)
	return err
}

func (s *pgTreeStore) Trashed() ([]model.Item, error) {
	rows, err := s.tx.Query(s.ctx, "SELECT "+itemColumns+
		" FROM items i WHERE i.user_id = $1 AND i.type = 'page' AND i.trashed_at IS NOT NULL", s.userID)
	if err != nil {
		return nil, err
	}
	return collectItems(rows)
}

func (s *pgTreeStore) CheckChildIDs(parentIDs []uuid.UUID) error {
	if len(parentIDs) == 0 {
		return nil
	}
	rows, err := s.tx.Query(s.ctx, `
		SELECT p.id FROM items p
		WHERE p.id = ANY($1) AND p.user_id = $2
		  AND (SELECT array_agg(x ORDER BY x) FROM unnest(p.child_ids) x)
		      IS DISTINCT FROM
		      (SELECT array_agg(c.id ORDER BY c.id) FROM items c WHERE c.parent_id = p.id AND c.trashed_at IS NULL)`,
		parentIDs, s.userID)
	if err != nil {
		return err
	}
	bad, err := pgx.CollectRows(rows, pgx.RowTo[uuid.UUID])
	if err != nil {
		return err
	}
	if len(bad) > 0 {
		return fmt.Errorf("child_ids out of step with children for %v", bad)
	}
	return nil
}

// inTree runs fn on a tree.Store inside one transaction holding the user's tree
// lock, and commits only if fn succeeds.
func (db *PostgreItemsDataSource) inTree(ctx context.Context, userID uuid.UUID, fn func(s tree.Store, workspaceID uuid.UUID, now time.Time) error) error {
	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockTree(ctx, tx, userID); err != nil {
		return err
	}
	var workspaceID uuid.UUID
	if err := tx.QueryRow(ctx, "SELECT id FROM items WHERE user_id = $1 AND type = 'workspace'", userID).Scan(&workspaceID); err != nil {
		return fmt.Errorf("finding the workspace: %w", err)
	}
	if err := fn(&pgTreeStore{ctx: ctx, tx: tx, userID: userID}, workspaceID, time.Now()); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (db *PostgreItemsDataSource) ApplyOps(ctx context.Context, userID uuid.UUID, ops []model.Op) error {
	return db.inTree(ctx, userID, func(s tree.Store, workspaceID uuid.UUID, now time.Time) error {
		return tree.Apply(s, workspaceID, ops, now)
	})
}

// ListTrash reads under the tree lock too, so it never sees half a batch.
func (db *PostgreItemsDataSource) ListTrash(ctx context.Context, userID uuid.UUID) ([]model.Item, error) {
	var pages []model.Item
	err := db.inTree(ctx, userID, func(s tree.Store, _ uuid.UUID, _ time.Time) error {
		var err error
		pages, err = tree.ListTrash(s)
		return err
	})
	return pages, err
}

func (db *PostgreItemsDataSource) DeleteFromTrash(ctx context.Context, userID, id uuid.UUID) error {
	return db.inTree(ctx, userID, func(s tree.Store, _ uuid.UUID, _ time.Time) error {
		return tree.DeleteFromTrash(s, id)
	})
}

func (db *PostgreItemsDataSource) EmptyTrash(ctx context.Context, userID uuid.UUID, before *time.Time) (int, error) {
	var n int
	err := db.inTree(ctx, userID, func(s tree.Store, _ uuid.UUID, _ time.Time) error {
		var err error
		n, err = tree.EmptyTrash(s, before)
		return err
	})
	return n, err
}

func (db *PostgreItemsDataSource) Duplicate(ctx context.Context, userID, id uuid.UUID) (model.Item, error) {
	var copied model.Item
	err := db.inTree(ctx, userID, func(s tree.Store, workspaceID uuid.UUID, now time.Time) error {
		var err error
		copied, err = tree.Duplicate(s, workspaceID, id, now)
		return err
	})
	return copied, err
}
