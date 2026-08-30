package errors

import "errors"

var (
	ErrEmailAlreadyExists   = errors.New("the email already exists")
	ErrWrongPasswordOrEmail = errors.New("wrong email or password")
	ErrInvalidEmailAddress  = errors.New("the email address appears to be invalid or undeliverable")
)
