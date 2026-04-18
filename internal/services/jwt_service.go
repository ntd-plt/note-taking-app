package services

import (
	"time"

	"note-taking-app/internal/configs"
	"note-taking-app/internal/errors"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type JWTService struct{}

func NewJWTService() *JWTService {
	return &JWTService{}
}

func (s *JWTService) GenerateAccessToken(userID uuid.UUID) (string, error) {
	config, err := configs.Load()
	if err != nil {
		return "", err
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 24).Unix(),
	})

	tokenString, err := token.SignedString([]byte(config.JWTSecret))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func (s *JWTService) GenerateRefreshToken(userID uuid.UUID) (string, error) {
	config, err := configs.Load()
	if err != nil {
		return "", err
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": userID,
		"exp":     time.Now().Add(time.Hour * 24 * 7).Unix(),
	})

	tokenString, err := token.SignedString([]byte(config.JWTSecret))
	if err != nil {
		return "", err
	}

	return tokenString, nil
}

func (s *JWTService) ValidateAccessToken(tokenString string) error {
	config, err := configs.Load()
	if err != nil {
		return err
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return config.JWTSecret, nil
	})
	if err != nil {
		return err
	}

	if !token.Valid {
		return errors.ErrInvalidToken
	}

	return nil
}

func (s *JWTService) ValidateRefreshToken(tokenString string) error {
	config, err := configs.Load()
	if err != nil {
		return err
	}

	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		return config.JWTSecret, nil
	})
	if err != nil {
		return err
	}

	if !token.Valid {
		return errors.ErrInvalidToken
	}

	return nil
}
