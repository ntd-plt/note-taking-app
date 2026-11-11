package database

import (
	"errors"
	"testing"

	"backend/internal/apperr"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestTranslateErr(t *testing.T) {
	cases := map[string]struct {
		code string
		kind apperr.Kind
		msg  string
	}{
		"check violation":       {pgCheckViolation, apperr.Invalid, "item is not valid"},
		"foreign key violation": {pgForeignKeyViolation, apperr.Invalid, "parent must be one of your items"},
		"unique violation":      {pgUniqueViolation, apperr.Conflict, "item already exists"},
	}
	for name, tc := range cases {
		e, ok := apperr.As(translateErr(&pgconn.PgError{Code: tc.code, ConstraintName: "items_page_props"}))
		if !ok || e.Kind != tc.kind || e.Msg != tc.msg {
			t.Errorf("%s: got %+v, want kind %v %q", name, e, tc.kind, tc.msg)
		}
	}
	other := errors.New("boom")
	if err := translateErr(other); err != other {
		t.Errorf("other error: err = %v, want it unchanged", err)
	}
}
