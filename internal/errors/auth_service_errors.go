package errors

import "errors"

var (
	ErrEmailAlreadyExists   = errors.New("email %s already exists")
	ErrWrongPasswordOrEmail = errors.New("wrong email or password")
)
