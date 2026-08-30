package services

import (
	"context"
	"errors"
)

type EmailVerificationClassification string

const (
	EmailVerificationDeliverable   EmailVerificationClassification = "deliverable"
	EmailVerificationRisky         EmailVerificationClassification = "risky"
	EmailVerificationUndeliverable EmailVerificationClassification = "undeliverable"
	EmailVerificationUnknown       EmailVerificationClassification = "unknown"
)

type EmailVerificationResult struct {
	Classification EmailVerificationClassification
	IsDisposable   bool
}

// EmailValidator checks whether an email address is deliverable. Callers
// should treat a non-nil error as "unverified" rather than "invalid" -
// implementations are expected to fail open on their own errors.
type EmailValidator interface {
	Verify(ctx context.Context, email string) (EmailVerificationResult, error)
}

var errEmailVerificationDisabled = errors.New("email verification is not configured")

// NoopEmailValidator always fails, so callers relying on EmailValidator's
// fail-open contract behave the same whether verification is unconfigured
// or a configured provider is unreachable.
type NoopEmailValidator struct{}

var _ EmailValidator = NoopEmailValidator{}

func (NoopEmailValidator) Verify(ctx context.Context, email string) (EmailVerificationResult, error) {
	return EmailVerificationResult{}, errEmailVerificationDisabled
}
