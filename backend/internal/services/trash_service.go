package services

import (
	"context"
	"log"
	"time"

	"backend/internal/model"

	"github.com/google/uuid"
)

// purgeTimeout bounds the trash cleanup that follows a trash batch.
const purgeTimeout = 10 * time.Second

type TrashService struct {
	db TrashStore
	// retention is how long a page stays in the trash before it is removed.
	retention time.Duration
}

func NewTrashService(db TrashStore, retention time.Duration) *TrashService {
	return &TrashService{db: db, retention: retention}
}

// trashCutoff is the moment before which a trashed page has expired.
func trashCutoff(now time.Time, retention time.Duration) time.Time {
	return now.Add(-retention)
}

// TrashedPage is a page in the trash and when it will be removed for good.
type TrashedPage struct {
	Page    model.Item
	PurgeAt time.Time
}

// ListTrash returns the pages in the trash, most recently trashed first, leaving
// out the ones past the retention period.
func (s *TrashService) ListTrash(ctx context.Context, userID uuid.UUID) ([]TrashedPage, error) {
	pages, err := s.db.ListTrash(ctx, userID)
	if err != nil {
		return nil, err
	}
	expired := trashCutoff(time.Now(), s.retention)
	out := []TrashedPage{}
	for _, p := range pages {
		if p.TrashedAt.Before(expired) {
			continue
		}
		out = append(out, TrashedPage{Page: p, PurgeAt: p.TrashedAt.Add(s.retention)})
	}
	return out, nil
}

func (s *TrashService) Restore(ctx context.Context, userID, id uuid.UUID) error {
	return s.db.ApplyOps(ctx, userID, []model.Op{{Op: model.OpRestore, ID: id}})
}

func (s *TrashService) DeleteFromTrash(ctx context.Context, userID, id uuid.UUID) error {
	return s.db.DeleteFromTrash(ctx, userID, id)
}

func (s *TrashService) EmptyTrash(ctx context.Context, userID uuid.UUID) (int, error) {
	return s.db.EmptyTrash(ctx, userID, nil)
}

// PurgeExpired removes pages past the retention period. It keeps going if the
// client disconnects; a failure is logged, not reported.
func (s *TrashService) PurgeExpired(ctx context.Context, userID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), purgeTimeout)
	defer cancel()
	before := trashCutoff(time.Now(), s.retention)
	if n, err := s.db.EmptyTrash(ctx, userID, &before); err != nil {
		log.Printf("purging the trash of %s: %v", userID, err)
	} else if n > 0 {
		log.Printf("purged %d expired pages from the trash of %s", n, userID)
	}
}
