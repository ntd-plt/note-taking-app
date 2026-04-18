package errors

import "errors"

var (
	ErrInvalidToken       = errors.New("invalid token")
	ErrExpiredToken       = errors.New("token has expired")
	ErrInvalidTokenFormat = errors.New("invalid token format")
)
