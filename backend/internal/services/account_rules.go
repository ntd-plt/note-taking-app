package services

import (
	"context"
	"strings"
	"unicode/utf8"

	"backend/internal/errors"

	"github.com/gin-gonic/gin/binding"
	"github.com/go-playground/validator/v10"
)

// The rules an account's fields must follow, shared by signup, profile updates and
// the seed command, so no path accepts what another refuses.

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
		return "", errors.ErrInvalidName
	}
	return name, nil
}

// CheckPassword accepts a password bcrypt can hash and that is not too short.
func CheckPassword(password string) error {
	if n := len(password); n < MinPasswordLength || n > MaxPasswordLength {
		return errors.ErrInvalidPassword
	}
	return nil
}

// CheckEmailFormat returns the normalized address if it is well formed. It uses
// gin's own validator, the one behind `binding:"email"` tags, so it can never
// disagree with a request that binds an email.
func CheckEmailFormat(raw string) (string, error) {
	email := NormalizeEmail(raw)
	v, ok := binding.Validator.Engine().(*validator.Validate)
	if !ok || v.Var(email, "required,email,max=254") != nil {
		return "", errors.ErrInvalidEmailFormat
	}
	return email, nil
}

// checkEmailDeliverable refuses an address the verifier is sure cannot receive
// mail, or that belongs to a disposable-email service. A failed verification
// lets the address through: the verifier fails open.
func checkEmailDeliverable(ctx context.Context, v EmailValidator, email string) error {
	result, err := v.Verify(ctx, email)
	if err == nil && (result.Classification == EmailVerificationUndeliverable || result.IsDisposable) {
		return errors.ErrInvalidEmailAddress
	}
	return nil
}
