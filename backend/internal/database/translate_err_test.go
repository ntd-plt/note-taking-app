package database

import (
	"errors"
	"testing"

	"backend/internal/pkg"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestTranslateErr(t *testing.T) {
	if err := translateErr(&pgconn.PgError{Code: pgCheckViolation, ConstraintName: "items_page_props"}); !errors.Is(err, ErrInvalidItem) {
		t.Errorf("check violation: err = %v, want ErrInvalidItem", err)
	}
	if err := translateErr(&pgconn.PgError{Code: pgForeignKeyViolation}); !errors.Is(err, ErrInvalidParent) {
		t.Errorf("foreign key violation: err = %v, want ErrInvalidParent", err)
	}
	var exists *pkg.AlreadyExistsError
	if err := translateErr(&pgconn.PgError{Code: pgUniqueViolation}); !errors.As(err, &exists) {
		t.Errorf("unique violation: err = %v, want AlreadyExistsError", err)
	}
	other := errors.New("boom")
	if err := translateErr(other); err != other {
		t.Errorf("other error: err = %v, want it unchanged", err)
	}
}
