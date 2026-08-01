package services

import (
	"context"
	"log"
	"time"

	emailverifier "github.com/AfterShip/email-verifier"
)

const (
	// emailVerifierTimeout bounds the whole check (DNS + SMTP dial), since
	// the underlying library call is synchronous and ignores ctx.
	emailVerifierTimeout     = 8 * time.Second
	emailVerifierConnTimeout = 5 * time.Second
	emailVerifierOpTimeout   = 5 * time.Second
)

// EmailVerifierValidator verifies email addresses locally via
// github.com/AfterShip/email-verifier: syntax, MX records, disposable-domain
// lookup, and a best-effort SMTP deliverability probe. It needs no API key.
//
// Major webmail providers (Gmail, Yahoo, Outlook) routinely block or
// rate-limit unsolicited SMTP verification probes, so the SMTP check often
// can't reach a deliverable/undeliverable verdict for them and reports
// unknown instead - that's expected, not a bug.
type EmailVerifierValidator struct {
	verifier *emailverifier.Verifier
}

var _ EmailValidator = (*EmailVerifierValidator)(nil)

func NewEmailValidator() *EmailVerifierValidator {
	v := emailverifier.NewVerifier().
		EnableSMTPCheck().
		ConnectTimeout(emailVerifierConnTimeout).
		OperationTimeout(emailVerifierOpTimeout)
	return &EmailVerifierValidator{verifier: v}
}

func (e *EmailVerifierValidator) Verify(ctx context.Context, email string) (EmailVerificationResult, error) {
	ctx, cancel := context.WithTimeout(ctx, emailVerifierTimeout)
	defer cancel()

	type outcome struct {
		result *emailverifier.Result
		err    error
	}
	ch := make(chan outcome, 1)
	go func() {
		result, err := e.verifier.Verify(email)
		ch <- outcome{result, err}
	}()

	select {
	case <-ctx.Done():
		log.Printf("email-verifier: verification timed out for %s, failing open", email)
		return EmailVerificationResult{}, ctx.Err()
	case o := <-ch:
		if o.err != nil {
			log.Printf("email-verifier: verification failed for %s, failing open: %v", email, o.err)
			return EmailVerificationResult{}, o.err
		}
		return EmailVerificationResult{
			Classification: translateReachable(o.result.Reachable),
			IsDisposable:   o.result.Disposable,
		}, nil
	}
}

func translateReachable(reachable string) EmailVerificationClassification {
	switch reachable {
	case "yes":
		return EmailVerificationDeliverable
	case "no":
		return EmailVerificationUndeliverable
	default:
		return EmailVerificationUnknown
	}
}
