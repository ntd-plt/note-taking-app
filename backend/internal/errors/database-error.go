package errors

import "errors"

var (
	ErrConnectionDatabase     = errors.New("database error")
	ErrUserNotFound           = errors.New("user not found")
	ErrInvalidCredentials     = errors.New("invalid credentials")
	ErrUserEmailAlreadyExists = errors.New("user email already exists")
)
