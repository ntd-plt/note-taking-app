package services

import "github.com/google/uuid"

type TokenService interface {
	GenerateAccessToken(userID uuid.UUID) (string, error)
	GenerateRefreshToken(userID uuid.UUID) (string, error)
	ValidateAccessToken(tokenString string) error
	ValidateRefreshToken(tokenString string) error
}
