package services

import (
	"context"
	"log"
	"net/http"
	"time"

	"backend/internal/database"
	"backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	MaxTrashIDs = 200

	minPurgeInterval = time.Second
	maxPurgeInterval = time.Hour
)

type TrashService struct {
	db        database.TrashDataSource
	retention time.Duration
	now       func() time.Time
}

func NewTrashService(db database.TrashDataSource, retention time.Duration) *TrashService {
	return NewTrashServiceWithClock(db, retention, time.Now)
}

func NewTrashServiceWithClock(db database.TrashDataSource, retention time.Duration, now func() time.Time) *TrashService {
	return &TrashService{db: db, retention: retention, now: now}
}

type IDsRequest struct {
	IDs []uuid.UUID `json:"ids"`
}

// cutoff is the oldest deleted_at still inside the retention period.
func (s *TrashService) cutoff() time.Time { return s.now().Add(-s.retention) }

func validateIDs(ids []uuid.UUID) *RequestError {
	if len(ids) == 0 {
		return requestErr(http.StatusBadRequest, "no items given")
	}
	if len(ids) > MaxTrashIDs {
		return requestErr(http.StatusBadRequest, "too many items: at most %d per request", MaxTrashIDs)
	}
	seen := make(map[uuid.UUID]bool, len(ids))
	for _, id := range ids {
		if seen[id] {
			return requestErr(http.StatusBadRequest, "item %s is listed more than once", id)
		}
		seen[id] = true
	}
	return nil
}

func (s *TrashService) idsFromBody(c *gin.Context) ([]uuid.UUID, bool) {
	var req IDsRequest
	if err := decodeBody(c, &req); err != nil {
		respondError(c, err)
		return nil, false
	}
	if err := validateIDs(req.IDs); err != nil {
		respondError(c, err)
		return nil, false
	}
	return req.IDs, true
}

// TrashItems godoc
// @Summary      Move items to the trash
// @Description  Moves items, and everything inside any folder among them, to the trash in one atomic step. Trashed items leave the item tree and lose their favorite flag. Returns every row that moved.
// @Tags         trash
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      IDsRequest  true  "Items to trash"
// @Success      200      {array}   model.TrashItem
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      413      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /items/trash [post]
func (s *TrashService) TrashItems(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	ids, ok := s.idsFromBody(c)
	if !ok {
		return
	}
	trashed, err := s.db.TrashItems(userID, ids, s.now())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, trashed)
}

// RestoreItems godoc
// @Summary      Restore items from the trash
// @Description  Puts trashed items back. A folder comes back with the items trashed together with it. An item whose original folder is not in the tree any more goes to the top level. Restored items are not favorites. Returns every restored item.
// @Tags         trash
// @Accept       json
// @Produce      json
// @Security     BearerAuth
// @Param        request  body      IDsRequest  true  "Trashed items to restore"
// @Success      200      {array}   model.Item
// @Failure      400      {object}  map[string]string
// @Failure      401      {object}  map[string]string
// @Failure      404      {object}  map[string]string
// @Failure      409      {object}  map[string]string
// @Failure      413      {object}  map[string]string
// @Failure      500      {object}  map[string]string
// @Router       /items/restore [post]
func (s *TrashService) RestoreItems(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	ids, ok := s.idsFromBody(c)
	if !ok {
		return
	}
	restored, err := s.db.RestoreItems(userID, ids, s.cutoff())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, restored)
}

// ListTrash godoc
// @Summary      List the trash
// @Description  Returns the authenticated user's trashed items, newest first, as a flat list. Items past the retention period are not listed.
// @Tags         trash
// @Produce      json
// @Security     BearerAuth
// @Success      200  {array}   model.TrashItem
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash [get]
func (s *TrashService) ListTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var items []model.TrashItem
	items, err := s.db.ListTrash(userID, s.cutoff())
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, items)
}

// DeleteTrashed godoc
// @Summary      Delete a trashed item permanently
// @Description  Permanently deletes one trashed item and the trashed items inside it. Use DELETE /items/{id} for items that are not in the trash.
// @Tags         trash
// @Security     BearerAuth
// @Param        id   path      string  true  "Trashed item ID"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash/{id} [delete]
func (s *TrashService) DeleteTrashed(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	if err := s.db.DeleteTrashed(userID, id, s.cutoff()); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// EmptyTrash godoc
// @Summary      Empty the trash
// @Description  Permanently deletes everything in the authenticated user's trash.
// @Tags         trash
// @Security     BearerAuth
// @Success      204  "No Content"
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash [delete]
func (s *TrashService) EmptyTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	if err := s.db.EmptyTrash(userID); err != nil {
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// PurgeExpired deletes everything trashed longer ago than the retention period and
// returns how many rows it removed.
func (s *TrashService) PurgeExpired() (int64, error) {
	return s.db.PurgeExpired(s.cutoff())
}

func purgeInterval(retention time.Duration) time.Duration {
	return min(max(retention/4, minPurgeInterval), maxPurgeInterval)
}

// RunPurger purges once and then on a timer until ctx is cancelled. Reads already
// ignore expired rows, so this only reclaims space.
func (s *TrashService) RunPurger(ctx context.Context) {
	purge := func() {
		if n, err := s.PurgeExpired(); err != nil {
			log.Printf("trash purge failed: %v", err)
		} else if n > 0 {
			log.Printf("trash purge removed %d expired items", n)
		}
	}
	purge()
	ticker := time.NewTicker(purgeInterval(s.retention))
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			purge()
		}
	}
}
