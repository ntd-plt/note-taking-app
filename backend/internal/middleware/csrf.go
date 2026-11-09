package middleware

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
)

// CSRF rejects state-changing requests (anything but GET, HEAD and OPTIONS) that a
// browser sends from another site, so a page elsewhere cannot act with the user's
// session cookie. It uses net/http's CrossOriginProtection: a browser request is
// cross-origin when its Sec-Fetch-Site header says so, or, without that header,
// when its Origin does not match the Host. Requests from allowedOrigins pass, and
// so do requests without those headers (non-browser clients such as curl, which
// carry no cookies by themselves).
func CSRF(allowedOrigins []string) (gin.HandlerFunc, error) {
	cop := http.NewCrossOriginProtection()
	for _, origin := range allowedOrigins {
		if err := cop.AddTrustedOrigin(origin); err != nil {
			return nil, fmt.Errorf("ALLOWED_ORIGINS: %w", err)
		}
	}
	return func(c *gin.Context) {
		if err := cop.Check(c.Request); err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "cross-origin request refused"})
			return
		}
		c.Next()
	}, nil
}
