// Package handlers is the HTTP layer: it decodes requests, calls the services and
// writes their results or errors.
package handlers

import (
	"log"
	"net/http"

	"backend/internal/apperr"

	"github.com/gin-gonic/gin"
)

var statusOf = map[apperr.Kind]int{
	apperr.Invalid:       http.StatusBadRequest,
	apperr.Unauthorized:  http.StatusUnauthorized,
	apperr.NotFound:      http.StatusNotFound,
	apperr.Conflict:      http.StatusConflict,
	apperr.Unprocessable: http.StatusUnprocessableEntity,
	apperr.TooLarge:      http.StatusRequestEntityTooLarge,
}

// writeError is the one place an error becomes an HTTP response.
func writeError(c *gin.Context, err error) {
	e, ok := apperr.As(err)
	var status int
	if ok {
		status, ok = statusOf[e.Kind]
	}
	if !ok {
		log.Printf("internal error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal server error"})
		return
	}
	if e.Err != nil {
		log.Printf("%v", e)
	}
	body := gin.H{"error": e.Msg}
	if e.OpIndex != nil {
		body["op_index"] = *e.OpIndex
	}
	c.JSON(status, body)
}
