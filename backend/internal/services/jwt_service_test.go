package services_test

import (
	stderrors "errors"
	"testing"
	"time"

	"backend/internal/errors"
	"backend/internal/services"
	"backend/internal/testutil"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const testSecret = "jwt-test-secret"

func signToken(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("signing token: %v", err)
	}
	return tokenString
}

func TestAccessTokenRoundtrip(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()
	userID := uuid.New()

	tokenString, err := svc.GenerateAccessToken(userID)
	if err != nil {
		t.Fatalf("GenerateAccessToken returned error: %v", err)
	}

	gotID, err := svc.ValidateAccessToken(tokenString)
	if err != nil {
		t.Fatalf("ValidateAccessToken returned error: %v", err)
	}
	if gotID != userID {
		t.Errorf("user ID = %v, want %v", gotID, userID)
	}
}

func TestRefreshTokenRoundtrip(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()
	userID := uuid.New()

	tokenString, err := svc.GenerateRefreshToken(userID)
	if err != nil {
		t.Fatalf("GenerateRefreshToken returned error: %v", err)
	}

	gotID, err := svc.ValidateRefreshToken(tokenString)
	if err != nil {
		t.Fatalf("ValidateRefreshToken returned error: %v", err)
	}
	if gotID != userID {
		t.Errorf("user ID = %v, want %v", gotID, userID)
	}
}

func TestValidateAccessTokenMalformed(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()

	if _, err := svc.ValidateAccessToken("not-a-jwt"); !stderrors.Is(err, errors.ErrInvalidToken) {
		t.Fatalf("error = %v, want %v", err, errors.ErrInvalidToken)
	}
}

func TestValidateAccessTokenExpired(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()

	tokenString := signToken(t, testSecret, jwt.MapClaims{
		"user_id": uuid.New().String(),
		"exp":     time.Now().Add(-time.Hour).Unix(),
	})

	if _, err := svc.ValidateAccessToken(tokenString); !stderrors.Is(err, errors.ErrExpiredToken) {
		t.Fatalf("error = %v, want %v", err, errors.ErrExpiredToken)
	}
}

func TestValidateAccessTokenWrongSecret(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()

	tokenString := signToken(t, "some-other-secret", jwt.MapClaims{
		"user_id": uuid.New().String(),
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	if _, err := svc.ValidateAccessToken(tokenString); !stderrors.Is(err, errors.ErrInvalidToken) {
		t.Fatalf("error = %v, want %v", err, errors.ErrInvalidToken)
	}
}

func TestValidateAccessTokenMissingUserID(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()

	tokenString := signToken(t, testSecret, jwt.MapClaims{
		"exp": time.Now().Add(time.Hour).Unix(),
	})

	if _, err := svc.ValidateAccessToken(tokenString); !stderrors.Is(err, errors.ErrInvalidToken) {
		t.Fatalf("error = %v, want %v", err, errors.ErrInvalidToken)
	}
}

func TestValidateAccessTokenNonUUIDUserID(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()

	tokenString := signToken(t, testSecret, jwt.MapClaims{
		"user_id": "not-a-uuid",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	if _, err := svc.ValidateAccessToken(tokenString); !stderrors.Is(err, errors.ErrInvalidToken) {
		t.Fatalf("error = %v, want %v", err, errors.ErrInvalidToken)
	}
}

func TestValidateRefreshTokenExpired(t *testing.T) {
	testutil.SetupJWTEnv(t, testSecret)
	svc := services.NewJWTService()

	tokenString := signToken(t, testSecret, jwt.MapClaims{
		"user_id": uuid.New().String(),
		"exp":     time.Now().Add(-time.Hour).Unix(),
	})

	if _, err := svc.ValidateRefreshToken(tokenString); !stderrors.Is(err, errors.ErrExpiredToken) {
		t.Fatalf("error = %v, want %v", err, errors.ErrExpiredToken)
	}
}
