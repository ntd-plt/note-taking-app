package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"backend/internal/apperr"
	"backend/internal/middleware"

	"github.com/gin-gonic/gin"
	"github.com/gin-gonic/gin/binding"
	"github.com/google/uuid"
)

// decode reads a JSON body strictly: unknown fields and trailing data are
// refused, then the struct's binding tags are checked. It reports false after
// writing the error response.
func decode(c *gin.Context, dst any) bool {
	dec := json.NewDecoder(c.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(c, apperr.New(apperr.TooLarge, "request body is too large"))
		} else {
			writeError(c, apperr.New(apperr.Invalid, "invalid request body: %s", err.Error()))
		}
		return false
	}
	if dec.More() {
		writeError(c, apperr.New(apperr.Invalid, "invalid request body: unexpected data after the JSON value"))
		return false
	}
	if err := binding.Validator.ValidateStruct(dst); err != nil {
		writeError(c, apperr.New(apperr.Invalid, "%s", err.Error()))
		return false
	}
	return true
}

func currentUser(c *gin.Context) (uuid.UUID, bool) {
	userID, ok := middleware.UserID(c)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
		return uuid.Nil, false
	}
	return userID, true
}

func pathID(c *gin.Context) (uuid.UUID, bool) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid item id"})
		return uuid.Nil, false
	}
	return id, true
}
