package services_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"backend/internal/apperr"
	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

var ctx = context.Background()

func newAuth() (*services.AuthService, *testutil.FakeUserStore, *testutil.FakeHasher) {
	db := testutil.NewFakeUserStore()
	hasher := &testutil.FakeHasher{}
	return services.NewAuthService(db, hasher, &testutil.FakeEmailValidator{}), db, hasher
}

func TestLoginTreatsUnknownEmailLikeWrongPassword(t *testing.T) {
	auth, _, hasher := newAuth()
	if _, err := auth.Signup(ctx, "Alice", "alice@example.com", "secret123"); err != nil {
		t.Fatal(err)
	}

	before := hasher.Compares
	_, wrong := auth.Login(ctx, "alice@example.com", "nope-nope")
	afterWrong := hasher.Compares
	_, unknown := auth.Login(ctx, "nobody@example.com", "nope-nope")

	if wrong != services.ErrWrongPasswordOrEmail || unknown != services.ErrWrongPasswordOrEmail {
		t.Errorf("errors = %v / %v, want ErrWrongPasswordOrEmail for both", wrong, unknown)
	}
	if afterWrong-before != 1 || hasher.Compares-afterWrong != 1 {
		t.Errorf("password comparisons: wrong password %d, unknown email %d; want 1 each", afterWrong-before, hasher.Compares-afterWrong)
	}
	if u, err := auth.Login(ctx, "Alice@Example.com", "secret123"); err != nil || u.Email != "alice@example.com" {
		t.Errorf("login = %+v, %v", u, err)
	}
}

func TestSignupAppliesTheAccountRules(t *testing.T) {
	auth, db, _ := newAuth()
	cases := []struct {
		name, email, password string
		want                  error
	}{
		{"  ", "a@example.com", "secret123", services.ErrInvalidName},
		{strings.Repeat("n", 51), "a@example.com", "secret123", services.ErrInvalidName},
		{"Bob", "a@example.com", strings.Repeat("🔑", 19), services.ErrInvalidPassword},
		{"Bob", "bob@", "secret123", services.ErrInvalidEmailFormat},
	}
	for _, tc := range cases {
		if _, err := auth.Signup(ctx, tc.name, tc.email, tc.password); err != tc.want {
			t.Errorf("Signup(%q, %q): err = %v, want %v", tc.name, tc.email, err, tc.want)
		}
	}
	u, err := auth.Signup(ctx, "  Bob  ", "Bob@Example.com", "secret123")
	if err != nil || u.Name != "Bob" || u.Email != "bob@example.com" {
		t.Fatalf("signup = %+v, %v", u, err)
	}
	if _, err := auth.Signup(ctx, "Bob", "bob@example.com", "secret123"); err != services.ErrEmailAlreadyExists {
		t.Errorf("second signup: err = %v, want ErrEmailAlreadyExists", err)
	}
	if len(db.Users) != 1 {
		t.Errorf("%d users stored, want 1", len(db.Users))
	}
}

func TestRename(t *testing.T) {
	db := testutil.NewFakeUserStore()
	users := services.NewUserService(db)
	u := model.NewUser("Alice", "alice@example.com", []byte("h"))
	if err := db.AddUser(ctx, u); err != nil {
		t.Fatal(err)
	}
	if got, err := users.Rename(ctx, u.ID, "  Alice L.  "); err != nil || got.Name != "Alice L." {
		t.Errorf("Rename = %+v, %v", got, err)
	}
	if _, err := users.Rename(ctx, u.ID, strings.Repeat("n", 51)); err != services.ErrInvalidName {
		t.Errorf("long name: err = %v, want ErrInvalidName", err)
	}
	if _, err := users.Rename(ctx, uuid.New(), "Bob"); !apperr.Is(err, apperr.NotFound) {
		t.Errorf("unknown user: err = %v, want NotFound", err)
	}
}

func TestApplyOpsChecksTheBatchBeforeRunningIt(t *testing.T) {
	db := testutil.NewFakeItemStore()
	ops := services.NewOpsService(db, services.NewTrashService(db, time.Hour))
	user := uuid.New()
	ws := db.Workspace(user)
	page := model.ItemTypePage

	if err := ops.ApplyOps(ctx, user, nil); !apperr.Is(err, apperr.Invalid) {
		t.Errorf("empty batch: err = %v, want Invalid", err)
	}
	if err := ops.ApplyOps(ctx, user, make([]model.Op, services.MaxOpsPerBatch+1)); !apperr.Is(err, apperr.TooLarge) {
		t.Errorf("oversized batch: err = %v, want TooLarge", err)
	}
	batch := []model.Op{
		{Op: model.OpCreate, ID: uuid.New(), Type: &page, ParentID: &ws.ID},
		{Op: model.OpMove, ID: uuid.New()},
	}
	err := ops.ApplyOps(ctx, user, batch)
	e, ok := apperr.As(err)
	if !ok || e.OpIndex == nil || *e.OpIndex != 1 {
		t.Errorf("bad second op: err = %v, want it named as operation 1", err)
	}
	if pages, _ := services.NewPagesService(db).Pages(ctx, user); len(pages) != 0 {
		t.Errorf("a rejected batch created %d pages", len(pages))
	}
}

// trashedAgo moves a trashed page's trashed_at into the past: the data gets old
// instead of the clock moving forward.
func trashedAgo(db *testutil.FakeItemStore, id uuid.UUID, ago time.Duration) {
	it := db.Items[id]
	at := time.Now().Add(-ago)
	it.TrashedAt = &at
	db.Items[id] = it
}

func TestTrashRetentionKeepsRecentPagesAndRemovesOldOnes(t *testing.T) {
	const day = 24 * time.Hour
	db := testutil.NewFakeItemStore()
	user := uuid.New()
	ws := db.Workspace(user)
	trash := services.NewTrashService(db, 30*day)
	ops := services.NewOpsService(db, trash)
	page := model.ItemTypePage
	recent, old := uuid.New(), uuid.New()
	for _, id := range []uuid.UUID{recent, old} {
		if err := ops.ApplyOps(ctx, user, []model.Op{{Op: model.OpCreate, ID: id, Type: &page, ParentID: &ws.ID}, {Op: model.OpTrash, ID: id}}); err != nil {
			t.Fatal(err)
		}
	}
	trashedAgo(db, recent, 29*day)
	trashedAgo(db, old, 31*day)

	listed, err := trash.ListTrash(ctx, user)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 || listed[0].Page.ID != recent {
		t.Fatalf("listed %d pages, want only the 29-day-old one", len(listed))
	}
	if left := time.Until(listed[0].PurgeAt); left < 23*time.Hour || left > 25*time.Hour {
		t.Errorf("purge_at is %v away, want about a day", left)
	}

	trash.PurgeExpired(ctx, user)
	if _, ok := db.Items[old]; ok {
		t.Error("the 31-day-old page was not purged")
	}
	if _, ok := db.Items[recent]; !ok {
		t.Error("the 29-day-old page was purged")
	}
}
