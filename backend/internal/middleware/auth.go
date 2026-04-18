package middleware

import (
	"errors"
	"net/http"
	"strings"

	middlewareErrors "backend/internal/errors"
	"backend/internal/services"

	"github.com/gin-gonic/gin"
)

func Auth(tokenService *services.JWTService) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization header is required"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": middlewareErrors.ErrInvalidBearerFormat})
			c.Abort()
			return
		}

		tokenString := parts[1]
		userID, err := tokenService.ValidateAccessToken(tokenString)
		if err != nil {
			if errors.Is(err, middlewareErrors.ErrInvalidToken) || errors.Is(err, middlewareErrors.ErrExpiredToken) {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
				c.Abort()
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "token validation failed"})
			c.Abort()
			return
		}

		c.Set("userID", userID)
		c.Next()
	}
}
