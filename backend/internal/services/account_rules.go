package services

import (
	"context"
	"strings"
	"unicode/utf8"

	"backend/internal/apperr"

	"github.com/go-playground/validator/v10"
)

// The rules an account's fields must follow, shared by signup, profile updates and
// the seed command, so no path accepts what another refuses.

var (
	ErrEmailAlreadyExists   = apperr.New(apperr.Conflict, "the email already exists")
	ErrWrongPasswordOrEmail = apperr.New(apperr.Unauthorized, "wrong email or password")
	ErrInvalidEmailAddress  = apperr.New(apperr.Unprocessable, "the email address appears to be invalid or undeliverable")
	ErrInvalidName          = apperr.New(apperr.Invalid, "name must be 1 to 50 characters")
	ErrInvalidPassword      = apperr.New(apperr.Invalid, "password must be 6 to 72 bytes long; accented letters and emoji count as several bytes")
	ErrInvalidEmailFormat   = apperr.New(apperr.Invalid, "email must be a valid address of at most 254 characters")
	ErrEmailChangeDisabled  = apperr.New(apperr.Invalid, "email can't be changed yet")
)

const (
	MaxNameLength     = 50 // characters
	MinPasswordLength = 6  // bytes
	// MaxPasswordLength is bcrypt's limit: it refuses to hash longer passwords.
	MaxPasswordLength = 72 // bytes
)

// NormalizeEmail trims whitespace and lowercases an email address so that
// lookups and storage treat e.g. "Bob@Example.com" and "bob@example.com" as
// the same address.
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// CheckName returns the name as it is stored: trimmed, 1 to MaxNameLength
// characters.
func CheckName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if n := utf8.RuneCountInString(name); n == 0 || n > MaxNameLength {
		return "", ErrInvalidName
	}
	return name, nil
}

// CheckPassword accepts a password bcrypt can hash and that is not too short.
func CheckPassword(password string) error {
	if n := len(password); n < MinPasswordLength || n > MaxPasswordLength {
		return ErrInvalidPassword
	}
	return nil
}

// emailRules uses go-playground's built-in email rule, the same one behind
// `binding:"email"` tags.
var emailRules = validator.New()

// CheckEmailFormat returns the normalized address if it is well formed.
func CheckEmailFormat(raw string) (string, error) {
	email := NormalizeEmail(raw)
	if emailRules.Var(email, "required,email,max=254") != nil {
		return "", ErrInvalidEmailFormat
	}
	return email, nil
}

// checkEmailDeliverable refuses an address the verifier is sure cannot receive
// mail, or that belongs to a disposable-email service. A failed verification
// lets the address through: the verifier fails open.
func checkEmailDeliverable(ctx context.Context, v EmailValidator, email string) error {
	result, err := v.Verify(ctx, email)
	if err == nil && (result.Classification == EmailVerificationUndeliverable || result.IsDisposable) {
		return ErrInvalidEmailAddress
	}
	return nil
}
