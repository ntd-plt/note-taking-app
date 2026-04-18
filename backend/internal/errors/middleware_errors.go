package errors

import "errors"

var (
	ErrMissingAuthHeader   = errors.New("missing %s header")
	ErrInvalidBearerFormat = errors.New("invalid %s bearer format")
)
