package errors

import "errors"

var (
	ErrEmailAlreadyExists   = errors.New("the email already exists")
	ErrWrongPasswordOrEmail = errors.New("wrong email or password")
	ErrInvalidEmailAddress  = errors.New("the email address appears to be invalid or undeliverable")

	// The account rules below answer 400: the request itself is not acceptable.
	ErrInvalidName         = errors.New("name must be 1 to 50 characters")
	ErrInvalidPassword     = errors.New("password must be 6 to 72 bytes long; accented letters and emoji count as several bytes")
	ErrInvalidEmailFormat  = errors.New("email must be a valid address of at most 254 characters")
	ErrEmailChangeDisabled = errors.New("email can't be changed yet")
)
