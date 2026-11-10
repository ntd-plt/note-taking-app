package services

import (
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"backend/internal/apperr"

	"github.com/gin-gonic/gin"
)

func TestWriteError(t *testing.T) {
	gin.SetMode(gin.TestMode)
	hidden := apperr.New(apperr.Invalid, "item is not valid")
	hidden.Err = errors.New("check constraint items_page_props")
	cases := []struct {
		name string
		err  error
		code int
		body string
	}{
		{"invalid", apperr.New(apperr.Invalid, "bad"), 400, `{"error":"bad"}`},
		{"unauthorized", ErrWrongPasswordOrEmail, 401, `{"error":"wrong email or password"}`},
		{"not found", apperr.NotFoundf("item"), 404, `{"error":"item not found"}`},
		{"conflict with op index", apperr.New(apperr.Conflict, "taken").AtOp(2), 409, `{"error":"taken","op_index":2}`},
		{"unprocessable", ErrInvalidEmailAddress, 422, `{"error":"the email address appears to be invalid or undeliverable"}`},
		{"too large", apperr.New(apperr.TooLarge, "big"), 413, `{"error":"big"}`},
		{"cause stays in logs", hidden, 400, `{"error":"item is not valid"}`},
		{"plain error", errors.New("pq: connection refused"), 500, `{"error":"internal server error"}`},
		{"internal kind", apperr.New(apperr.Internal, "secret detail"), 500, `{"error":"internal server error"}`},
	}
	for _, tc := range cases {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		writeError(c, tc.err)
		if w.Code != tc.code || strings.TrimSpace(w.Body.String()) != tc.body {
			t.Errorf("%s: got %d %s, want %d %s", tc.name, w.Code, w.Body.String(), tc.code, tc.body)
		}
	}
}
