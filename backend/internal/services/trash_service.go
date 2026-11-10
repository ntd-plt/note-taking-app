package services

import (
	"context"
	"log"
	"net/http"
	"time"

	"backend/internal/model"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// purgeTimeout bounds the trash cleanup that follows a trash batch.
const purgeTimeout = 10 * time.Second

// TrashResponse lists the pages in the trash, most recently trashed first. Each
// page's purge_at is when it will be removed for good.
type TrashResponse struct {
	Pages []TrashedPage `json:"pages"`
}

type TrashedPage struct {
	model.Item
	PurgeAt string `json:"purge_at"`
}

// purgeExpiredTrash removes the user's pages that have been in the trash longer
// than the retention period. It runs after a batch that moved pages to the trash,
// so the trash is cleaned lazily; a failure is logged, not reported. It is
// housekeeping, so it keeps going if the client disconnects, within its own limit.
func (s *ItemsService) purgeExpiredTrash(ctx context.Context, userID uuid.UUID) {
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), purgeTimeout)
	defer cancel()
	before := s.now().Add(-s.retention)
	if n, err := s.db.EmptyTrash(ctx, userID, &before); err != nil {
		log.Printf("purging the trash of %s: %v", userID, err)
	} else if n > 0 {
		log.Printf("purged %d expired pages from the trash of %s", n, userID)
	}
}

// ListTrash godoc
// @Summary      List the trash
// @Description  Returns the pages in the trash, most recently trashed first. Pages inside a trashed page are not listed on their own. Pages past the retention period are left out; they are removed the next time something is moved to the trash.
// @Tags         trash
// @Produce      json
// @Security     SessionCookie
// @Success      200  {object}  TrashResponse
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash [get]
func (s *ItemsService) ListTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	pages, err := s.db.ListTrash(c.Request.Context(), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	expired := s.now().Add(-s.retention)
	out := TrashResponse{Pages: []TrashedPage{}}
	for _, p := range pages {
		if p.TrashedAt.Before(expired) {
			continue
		}
		out.Pages = append(out.Pages, TrashedPage{Item: p, PurgeAt: p.TrashedAt.Add(s.retention).UTC().Format(time.RFC3339)})
	}
	c.JSON(http.StatusOK, out)
}

// RestoreFromTrash godoc
// @Summary      Restore a page from the trash
// @Description  Puts the page back at the end of the top level, with everything that was inside it. To restore it somewhere else, send a restore operation to /ops. A page inside a trashed page cannot be restored on its own.
// @Tags         trash
// @Security     SessionCookie
// @Param        id   path  string  true  "Page id"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]any
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]any
// @Failure      409  {object}  map[string]any
// @Failure      500  {object}  map[string]string
// @Router       /trash/{id}/restore [post]
func (s *ItemsService) RestoreFromTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	if err := s.db.ApplyOps(c.Request.Context(), userID, []model.Op{{Op: model.OpRestore, ID: id}}); err != nil {
		respondOpError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// DeleteFromTrash godoc
// @Summary      Delete a page for good
// @Description  Removes a page in the trash and everything inside it. This cannot be undone.
// @Tags         trash
// @Security     SessionCookie
// @Param        id   path  string  true  "Page id"
// @Success      204  "No Content"
// @Failure      400  {object}  map[string]string
// @Failure      401  {object}  map[string]string
// @Failure      404  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash/{id} [delete]
func (s *ItemsService) DeleteFromTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	id, ok := itemIDParam(c)
	if !ok {
		return
	}
	if err := s.db.DeleteFromTrash(c.Request.Context(), userID, id); err != nil {
		if isNotFound(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "page is not in the trash"})
			return
		}
		respondError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

// EmptyTrash godoc
// @Summary      Empty the trash
// @Description  Removes every page in the trash, and everything inside them, for good.
// @Tags         trash
// @Produce      json
// @Security     SessionCookie
// @Success      200  {object}  map[string]int  "deleted: how many pages were removed"
// @Failure      401  {object}  map[string]string
// @Failure      500  {object}  map[string]string
// @Router       /trash [delete]
func (s *ItemsService) EmptyTrash(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	n, err := s.db.EmptyTrash(c.Request.Context(), userID, nil)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"deleted": n})
}
