package services

import "github.com/google/uuid"

type TokenService interface {
	GenerateAccessToken(userID uuid.UUID) (string, error)
	GenerateRefreshToken(userID uuid.UUID) (string, error)
	ValidateAccessToken(tokenString string) (uuid.UUID, error)
	ValidateRefreshToken(tokenString string) (uuid.UUID, error)
}
