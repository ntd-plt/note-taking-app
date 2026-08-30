package services

import (
	"errors"
	"testing"

	emailverifier "github.com/AfterShip/email-verifier"
)

func TestClassifyVerifyOutcome_MXLookupFailed(t *testing.T) {
	result := &emailverifier.Result{HasMxRecords: false, Disposable: false}
	err := errors.New("no such host")

	got, gotErr := classifyVerifyOutcome("bob@example.invalid", result, err)

	if gotErr != nil {
		t.Fatalf("expected nil error (fail closed via classification, not err), got %v", gotErr)
	}
	if got.Classification != EmailVerificationUndeliverable {
		t.Errorf("Classification = %q, want %q", got.Classification, EmailVerificationUndeliverable)
	}
}

func TestClassifyVerifyOutcome_MXLookupFailedButDisposable(t *testing.T) {
	result := &emailverifier.Result{HasMxRecords: false, Disposable: true}
	err := errors.New("no such host")

	got, gotErr := classifyVerifyOutcome("bob@throwaway.invalid", result, err)

	if gotErr != nil {
		t.Fatalf("expected nil error, got %v", gotErr)
	}
	if !got.IsDisposable {
		t.Errorf("IsDisposable = false, want true")
	}
}

func TestClassifyVerifyOutcome_SMTPStageFailedWithMXPresent(t *testing.T) {
	result := &emailverifier.Result{HasMxRecords: true}
	err := errors.New("smtp probe blocked")

	got, gotErr := classifyVerifyOutcome("bob@gmail.com", result, err)

	if gotErr == nil {
		t.Fatalf("expected the error to propagate (fail open), got nil")
	}
	if got != (EmailVerificationResult{}) {
		t.Errorf("expected zero-value result on fail-open, got %+v", got)
	}
}

func TestClassifyVerifyOutcome_NilResultOnError(t *testing.T) {
	err := errors.New("unexpected failure")

	got, gotErr := classifyVerifyOutcome("bob@example.com", nil, err)

	if gotErr == nil {
		t.Fatalf("expected the error to propagate (fail open), got nil")
	}
	if got != (EmailVerificationResult{}) {
		t.Errorf("expected zero-value result on fail-open, got %+v", got)
	}
}

func TestClassifyVerifyOutcome_Success(t *testing.T) {
	result := &emailverifier.Result{HasMxRecords: true, Reachable: "yes", Disposable: false}

	got, gotErr := classifyVerifyOutcome("bob@example.com", result, nil)

	if gotErr != nil {
		t.Fatalf("expected nil error, got %v", gotErr)
	}
	if got.Classification != EmailVerificationDeliverable {
		t.Errorf("Classification = %q, want %q", got.Classification, EmailVerificationDeliverable)
	}
	if got.IsDisposable {
		t.Errorf("IsDisposable = true, want false")
	}
}
