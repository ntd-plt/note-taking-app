package services_test

import (
	"context"
	stderrors "errors"
	"testing"

	"backend/internal/errors"
	"backend/internal/model"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/google/uuid"
)

func newAuthService(db *testutil.FakeDatabase, ts *testutil.FakeTokenService) *services.AuthService {
	return newAuthServiceWithValidator(db, ts, &testutil.FakeEmailValidator{})
}

func newAuthServiceWithValidator(db *testutil.FakeDatabase, ts *testutil.FakeTokenService, ev *testutil.FakeEmailValidator) *services.AuthService {
	return services.NewAuthService(db, &testutil.FakeHasher{}, ts, ev)
}

func addUser(db *testutil.FakeDatabase, email, password string) model.User {
	u := *model.New().WithEmail(email).WithPasswordHash([]byte("hashed:" + password))
	db.Users[u.ID] = u
	return u
}

func TestLoginSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	user := addUser(db, "alice@example.com", "secret123")
	svc := newAuthService(db, &testutil.FakeTokenService{ValidUserID: user.ID})

	resp, err := svc.Login("alice@example.com", "secret123")
	if err != nil {
		t.Fatalf("Login returned error: %v", err)
	}
	if resp.AccessToken != "access-token" {
		t.Errorf("access token = %q, want %q", resp.AccessToken, "access-token")
	}
	if resp.RefreshToken != "refresh-token" {
		t.Errorf("refresh token = %q, want %q", resp.RefreshToken, "refresh-token")
	}
}

func TestLoginUnknownEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthService(db, &testutil.FakeTokenService{})

	if _, err := svc.Login("nobody@example.com", "secret123"); err == nil {
		t.Fatal("Login with unknown email should fail")
	}
}

func TestLoginWrongPassword(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	svc := newAuthService(db, &testutil.FakeTokenService{})

	_, err := svc.Login("alice@example.com", "wrong-password")
	if !stderrors.Is(err, errors.ErrWrongPasswordOrEmail) {
		t.Fatalf("error = %v, want %v", err, errors.ErrWrongPasswordOrEmail)
	}
}

func TestLoginTokenGenerationFails(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	tokenErr := stderrors.New("token generation failed")
	svc := newAuthService(db, &testutil.FakeTokenService{GenerateAccessErr: tokenErr})

	if _, err := svc.Login("alice@example.com", "secret123"); !stderrors.Is(err, tokenErr) {
		t.Fatalf("error = %v, want %v", err, tokenErr)
	}
}

func TestSignupSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthService(db, &testutil.FakeTokenService{})

	if err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123"); err != nil {
		t.Fatalf("Signup returned error: %v", err)
	}

	user, err := db.GetUserByEmail("bob@example.com")
	if err != nil {
		t.Fatalf("user not stored: %v", err)
	}
	if user.Name != "Bob" {
		t.Errorf("name = %q, want %q", user.Name, "Bob")
	}
	if string(user.PasswordHash) != "hashed:secret123" {
		t.Errorf("password hash = %q, want hashed password, not plaintext", user.PasswordHash)
	}
}

func TestSignupDuplicateEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	addUser(db, "alice@example.com", "secret123")
	svc := newAuthService(db, &testutil.FakeTokenService{})

	err := svc.Signup(context.Background(), "Alice Again", "alice@example.com", "other-password")
	if !stderrors.Is(err, errors.ErrEmailAlreadyExists) {
		t.Fatalf("error = %v, want %v", err, errors.ErrEmailAlreadyExists)
	}
}

func TestSignupAllowsDeliverableEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthServiceWithValidator(db, &testutil.FakeTokenService{}, &testutil.FakeEmailValidator{
		Classification: services.EmailVerificationDeliverable,
	})

	if err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123"); err != nil {
		t.Fatalf("Signup returned error: %v", err)
	}
	if _, err := db.GetUserByEmail("bob@example.com"); err != nil {
		t.Fatalf("user not stored: %v", err)
	}
}

func TestSignupRejectsUndeliverableEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthServiceWithValidator(db, &testutil.FakeTokenService{}, &testutil.FakeEmailValidator{
		Classification: services.EmailVerificationUndeliverable,
	})

	err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123")
	if !stderrors.Is(err, errors.ErrInvalidEmailAddress) {
		t.Fatalf("error = %v, want %v", err, errors.ErrInvalidEmailAddress)
	}
	if _, err := db.GetUserByEmail("bob@example.com"); err == nil {
		t.Error("user should not have been stored")
	}
}

func TestSignupRejectsDisposableEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthServiceWithValidator(db, &testutil.FakeTokenService{}, &testutil.FakeEmailValidator{
		Classification: services.EmailVerificationRisky,
		IsDisposable:   true,
	})

	err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123")
	if !stderrors.Is(err, errors.ErrInvalidEmailAddress) {
		t.Fatalf("error = %v, want %v", err, errors.ErrInvalidEmailAddress)
	}
	if _, err := db.GetUserByEmail("bob@example.com"); err == nil {
		t.Error("user should not have been stored")
	}
}

func TestSignupAllowsRiskyNonDisposableEmail(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthServiceWithValidator(db, &testutil.FakeTokenService{}, &testutil.FakeEmailValidator{
		Classification: services.EmailVerificationRisky,
		IsDisposable:   false,
	})

	if err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123"); err != nil {
		t.Fatalf("Signup returned error: %v", err)
	}
}

func TestSignupAllowsUnknownClassification(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthServiceWithValidator(db, &testutil.FakeTokenService{}, &testutil.FakeEmailValidator{
		Classification: services.EmailVerificationUnknown,
	})

	if err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123"); err != nil {
		t.Fatalf("Signup returned error: %v", err)
	}
}

func TestSignupAllowsOnValidatorError(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthServiceWithValidator(db, &testutil.FakeTokenService{}, &testutil.FakeEmailValidator{
		Err: stderrors.New("email validator down"),
	})

	if err := svc.Signup(context.Background(), "Bob", "bob@example.com", "secret123"); err != nil {
		t.Fatalf("Signup returned error: %v", err)
	}
	if _, err := db.GetUserByEmail("bob@example.com"); err != nil {
		t.Fatalf("user not stored: %v", err)
	}
}

func TestRefreshTokenSuccess(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthService(db, &testutil.FakeTokenService{ValidUserID: uuid.New()})

	accessToken, err := svc.RefreshToken("refresh-token")
	if err != nil {
		t.Fatalf("RefreshToken returned error: %v", err)
	}
	if accessToken != "access-token" {
		t.Errorf("access token = %q, want %q", accessToken, "access-token")
	}
}

func TestRefreshTokenInvalid(t *testing.T) {
	db := testutil.NewFakeDatabase()
	svc := newAuthService(db, &testutil.FakeTokenService{})

	if _, err := svc.RefreshToken("not-a-refresh-token"); err == nil {
		t.Fatal("RefreshToken with invalid token should fail")
	}
}
