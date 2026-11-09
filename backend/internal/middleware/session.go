package middleware

import (
	"context"
	"errors"
	"log"
	"net/http"

	"backend/internal/session"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// userIDKey is where RequireSession puts the logged-in user's id in the gin context.
const userIDKey = "userID"

// SessionLookup finds the live session for a cookie id.
type SessionLookup interface {
	Lookup(ctx context.Context, id string) (session.Session, error)
}

// RequireSession lets a request through only with a live session cookie, and makes
// the session's user available through UserID.
func RequireSession(sessions SessionLookup, cookie session.Cookie) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := cookie.Read(c.Request)
		if id == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
			return
		}
		sess, err := sessions.Lookup(c.Request.Context(), id)
		if errors.Is(err, session.ErrNotFound) {
			cookie.Clear(c.Writer)
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
			return
		}
		if err != nil {
			log.Printf("looking up a session: %v", err)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
			return
		}
		SetUserID(c, sess.UserID)
		c.Next()
	}
}

// UserID returns the logged-in user set by RequireSession.
func UserID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(userIDKey)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}

// SetUserID marks the request as made by the user. RequireSession calls it; tests
// use it to stand in for a session.
func SetUserID(c *gin.Context, id uuid.UUID) {
	c.Set(userIDKey, id)
}
