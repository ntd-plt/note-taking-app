package pkg

import "fmt"

// NotFoundError indicates a requested resource does not exist. Datasources
// return it (wrapped or bare) in place of driver-specific "no rows" errors,
// so callers can distinguish "not found" from a genuine failure via
// errors.As, regardless of which datasource produced it.
type NotFoundError struct {
	Resource string
}

func NewNotFoundError(resource string) *NotFoundError {
	return &NotFoundError{Resource: resource}
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("%s not found", e.Resource)
}

// AlreadyExistsError indicates a resource conflicts with an existing one on
// a unique field. Datasources return it in place of driver-specific
// unique-constraint-violation errors.
type AlreadyExistsError struct {
	Resource string
}

func NewAlreadyExistsError(resource string) *AlreadyExistsError {
	return &AlreadyExistsError{Resource: resource}
}

func (e *AlreadyExistsError) Error() string {
	return fmt.Sprintf("%s already exists", e.Resource)
}
