// Package apperr is the one error type the services, the tree engine and the
// datasources return; the HTTP layer maps its Kind to a status code.
package apperr

import (
	"errors"
	"fmt"
)

type Kind int

const (
	Internal Kind = iota
	Invalid
	Unauthorized
	NotFound
	Conflict
	Unprocessable
	TooLarge
)

type Error struct {
	Kind Kind
	// Msg is safe to show to the client.
	Msg string
	// OpIndex names the failing operation of an /ops batch.
	OpIndex *int
	// Err is the underlying cause, for logs only.
	Err error
}

func (e *Error) Error() string {
	msg := e.Msg
	if e.OpIndex != nil {
		msg = fmt.Sprintf("operation %d: %s", *e.OpIndex, msg)
	}
	if e.Err != nil {
		msg += ": " + e.Err.Error()
	}
	return msg
}

func (e *Error) Unwrap() error { return e.Err }

func New(kind Kind, format string, args ...any) *Error {
	return &Error{Kind: kind, Msg: fmt.Sprintf(format, args...)}
}

func NotFoundf(what string) *Error { return New(NotFound, "%s not found", what) }

// AtOp returns a copy of e that names operation i.
func (e *Error) AtOp(i int) *Error {
	c := *e
	c.OpIndex = &i
	return &c
}

// As returns the *Error in err's chain, if any.
func As(err error) (*Error, bool) {
	var e *Error
	ok := errors.As(err, &e)
	return e, ok
}

// Is reports whether err is an *Error of the given kind.
func Is(err error, kind Kind) bool {
	e, ok := As(err)
	return ok && e.Kind == kind
}
