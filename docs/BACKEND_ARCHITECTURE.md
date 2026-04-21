# Backend Architecture

## Overview

This is a **Go/Gin** REST API backend with **PostgreSQL** database. It follows a **layered architecture** with clear separation of concerns.

---

## Project Structure

```
backend/
├── cmd/server/           # Application entry point
│   └── main.go            # Server initialization & routing setup
├── internal/
│   ├── configs/           # Configuration management
│   ├── database/         # Database interface & implementations
│   ├── errors/           # Custom error types
│   ├── handlers/         # HTTP request handlers (Controllers)
│   ├── middleware/       # Gin middleware (Auth)
│   ├── model/            # Data models (User, Note)
│   ├── pkg/              # DTOs & utilities
│   │   └── hash/        # Password hashing interface
│   └── services/         # Business logic layer
└── migrations/           # SQL migrations
```

---

## Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HTTP Request                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Handlers (controllers/handlers/)                           │
│  - Receive HTTP requests                                    │
│  - Parse & validate input                                  │
│  - Call appropriate service methods                        │
│  - Return HTTP responses                                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Services (services/)                                       │
│  - Business logic                                           │
│  - Token generation/validation                             │
│  - Password hashing                                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  Database (database/)                                      │
│  - Interface definition                                    │
│  - PostgreSQL implementation                               │
│  - CRUD operations                                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  PostgreSQL Database                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Models (`model/`)
- **User**: id, email, password_hash, name, created_at
- **Note**: id, title, content, user_id, created_at, updated_at

### 2. Database Interface (`database/database.go`)
```go
type Database interface {
    Connect() error
    Disconnect() error
    // User operations
    GetUserByEmail(email string) (user.User, error)
    GetUserByID(id uuid.UUID) (user.User, error)
    AddUser(user user.User) error
    // Note operations
    CreateNote(note user.Note) (user.Note, error)
    GetNoteByID(id int) (user.Note, error)
    GetNotesByUserID(userID uuid.UUID) ([]user.Note, error)
    UpdateNote(note user.Note) error
    DeleteNote(id int) error
}
```

### 3. Services (`services/`)
- **AuthService**: Login, Signup, Logout, RefreshToken
- **JWTService**: Token generation & validation
- **TokenService**: Interface for JWT operations

### 4. Handlers (`handlers/`)
- **AuthHandler**: POST /auth/login, POST /auth/signup, POST /auth/refresh-token
- **NotesHandler**: CRUD for /api/notes

### 5. Middleware (`middleware/`)
- **Auth**: Validates JWT Bearer token, extracts userID to context

---

## API Endpoints

### Auth (Public)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with email/password |
| POST | `/auth/signup` | Register new user |
| POST | `/auth/refresh-token` | Refresh access token |

### Notes (Protected - requires Bearer token)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notes` | Get all user's notes |
| POST | `/api/notes` | Create new note |
| GET | `/api/notes/:id` | Get specific note |
| PUT | `/api/notes/:id` | Update note |
| DELETE | `/api/notes/:id` | Delete note |

---

## Authentication Flow

1. **Signup**: User registers → password hashed → user saved to DB
2. **Login**: 
   - User provides email/password
   - Verify password with bcrypt
   - Generate Access Token (short-lived, e.g., 15min)
   - Generate Refresh Token (long-lived, e.g., 7 days)
3. **Accessing Protected Routes**:
   - Client sends request with `Authorization: Bearer <access_token>`
   - Middleware validates token
   - If expired → client uses refresh token to get new access token
   - If valid → request proceeds with userID in context

---

## Data Flow Example: Create Note

```
POST /api/notes
Authorization: Bearer <access_token>
{ "title": "My Note", "content": "<p>Hello World</p>" }
```

1. **Middleware** validates JWT, extracts userID, adds to `c.Context`
2. **Handler** receives request, extracts title/content & userID
3. **Service** creates note via database interface
4. **Database** inserts into PostgreSQL, returns created note
5. **Handler** returns 201 with note JSON

---

## Key Design Patterns

| Pattern | Usage |
|---------|-------|
| **Dependency Injection** | Services receive DB & hasher via constructor |
| **Interface Segregation** | Database and Hasher use interfaces |
| **Repository Pattern** | Database layer abstracts SQL queries |
| **Middleware Chain** | Gin middleware for auth validation |

---

## Error Handling

Custom errors defined in `errors/`:
- `ErrWrongPasswordOrEmail`
- `ErrEmailAlreadyExists`
- `ErrInvalidToken`
- `ErrExpiredToken`

Handlers return appropriate HTTP status codes with JSON error messages.

---

## Configuration

Environment variables (via `.env-template`):
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `JWT_SECRET`
- `PORT` (default 8080)