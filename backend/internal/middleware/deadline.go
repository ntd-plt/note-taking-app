package middleware

import (
	"context"
	"time"

	"github.com/gin-gonic/gin"
)

// Deadline gives every request at most d to do its work. The server's write
// timeout only closes the connection; this cancels the request's context, so
// database queries still running for it are stopped too.
func Deadline(d time.Duration) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), d)
		defer cancel()
		c.Request = c.Request.WithContext(ctx)
		c.Next()
	}
}
