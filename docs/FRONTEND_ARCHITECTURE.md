# Frontend Architecture

## Overview

This is a **React + Vite** SPA frontend with **Tailwind CSS** styling. It uses **React Router** for navigation, **Context API** for state management, and **TipTap** for rich text editing.

---

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── auth/         # LoginForm, SignupForm
│   │   ├── editor/       # RichTextEditor (TipTap)
│   │   ├── layout/      # AppLayout, Sidebar, NoteList, NoteEditor
│   │   └── common/      # Shared UI components (future)
│   ├── context/         # React Context (AuthContext, NotesContext)
│   ├── services/        # API client & service functions
│   ├── pages/           # Route pages
│   ├── hooks/           # Custom hooks (useDebounce)
│   ├── utils/           # Utilities (tokenManager)
│   ├── App.jsx          # Root component with routing
│   ├── main.jsx         # Entry point
│   └── index.css        # Global styles (Tailwind)
├── public/
├── package.json
├── vite.config.js
├── tailwind.config.js
└── .env.example
```

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                        │
│  Pages (LoginPage, NotesPage) → Layout → Editor           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Context (State Management)              │
│  AuthContext (user, login, logout, isAuth)                 │
│  NotesContext (notes, CRUD, search)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Services (API Layer)                    │
│  api.js (Axios instance with interceptors)                │
│  authService.js, noteService.js                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    External APIs                           │
│  Backend REST API (Go/Gin)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
App (BrowserRouter)
├── AuthProvider
│   └── Routes
│       ├── /login → LoginPage → LoginForm
│       ├── /signup → SignupPage → SignupForm
│       └── /notes → ProtectedRoute
│           └── NotesProvider
│               └── NotesPage
│                   └── AppLayout
│                       ├── Sidebar (search, user info, logout)
│                       ├── NoteList (note list, create button)
│                       └── NoteEditor (title, rich text editor)
```

---

## State Management

### AuthContext (`context/AuthContext.jsx`)
Manages authentication state globally.

```javascript
// Provider state
{ user, loading, isAuth, login, signup, logout }

// Usage in components
const { user, isAuth, login, logout } = useAuth();
```

**Responsibilities:**
- Check auth status on app load
- Provide login/signup/logout functions
- Persist auth state across sessions

### NotesContext (`context/NotesContext.jsx`)
Manages notes data and operations.

```javascript
// Provider state
{ notes, selectedNote, loading, error, fetchNotes, createNote, updateNote, deleteNote, searchNotes }

// Usage in components
const { notes, selectedNote, createNote } = useNotes();
```

**Responsibilities:**
- Fetch notes from API
- Create/Update/Delete notes
- Handle search functionality
- Track selected note for editing

---

## API Layer

### Axios Instance (`services/api.js`)
Centralized HTTP client with interceptors.

```javascript
import api from './services/api';

// Automatic token injection
api.get('/notes'); // Adds Authorization: Bearer <token>

// Auto-refresh on 401
// If token expires, automatically refresh and retry
```

**Key Features:**
- Base URL from environment variable (`VITE_API_URL`)
- Request interceptor: adds JWT token
- Response interceptor: handles 401, auto-refreshes token

### Service Modules
- **authService**: login, signup, logout, getCurrentUser
- **noteService**: getAll, getById, create, update, delete, search

---

## Authentication Flow

```
1. User opens app
   │
   ▼
2. AuthContext checks localStorage for token
   │
   ├── Has token → Validate with backend → Set isAuth = true
   │
   └── No token → Set isAuth = false, show login
   │
   ▼
3. User logs in → authService.login()
   │
   ▼
4. API returns access_token + refresh_token
   │
   ▼
5. Tokens stored in localStorage via tokenManager
   │
   ▼
6. Subsequent requests: Axios interceptor adds Bearer token
   │
   ▼
7. On 401 (expired): Auto-refresh using refresh_token
```

---

## Token Management (`utils/tokenManager.js`)

```javascript
// Storage keys
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Functions
getAccessToken()     // Get current access token
getRefreshToken()    // Get current refresh token
setTokens(access, refresh)  // Store both tokens
clearTokens()        // Remove tokens (logout)
isAuthenticated()    // Check if user has token
```

**Note:** Access token stored in memory implicitly by React state; refresh token persists in localStorage.

---

## Rich Text Editor (TipTap)

### Component: `components/editor/RichTextEditor.jsx`

Uses **@tiptap/react** with starter extensions:

| Extension | Feature |
|-----------|---------|
| StarterKit | Bold, italic, headings, lists, code blocks |
| Underline | Underline text |
| Placeholder | "Start writing..." placeholder |

### Editor Features
- Toolbar with formatting buttons
- Auto-save (debounced 1s)
- Placeholder text when empty

---

## Protected Routes

```javascript
// ProtectedRoute checks:
// 1. Is user authenticated? (isAuth from AuthContext)
// 2. Is still loading?
//    - Loading → Show loading spinner
//    - Not authenticated → Redirect to /login
//    - Authenticated → Show children
```

---

## Data Flow: Create Note

```
User clicks "New Note" button
        │
        ▼
NoteList component calls createNote()
        │
        ▼
NotesContext.createNote(title, content)
        │
        ▼
noteService.create(title, content)
        │
        ▼
api.post('/notes', { title, content })
        │
        ├── Adds Authorization header
        ├── Sends to backend
        └── Returns created note
        │
        ▼
NotesContext updates notes array
        │
        ▼
UI re-renders with new note selected
```

---

## Auto-Save Implementation

In `NoteEditor.jsx`:

```javascript
useEffect(() => {
  if (!selectedNote) return;
  
  const timer = setTimeout(() => {
    // Only save if content changed
    if (title !== selectedNote.title || content !== selectedNote.content) {
      handleSave();
    }
  }, 1000); // 1 second debounce

  return () => clearTimeout(timer);
}, [title, content, selectedNote]);
```

---

## Environment Variables

```bash
VITE_API_URL=http://localhost:8080/api
```

---

## Styling

- **Tailwind CSS** for utility classes
- **CSS Variables** for theming:
  - `--accent`, `--bg`, `--border`, `--text`, `--text-h`
  - Dark mode support via `@media (prefers-color-scheme: dark)`

---

## Key Design Patterns

| Pattern | Implementation |
|---------|---------------|
| **Context API** | AuthContext, NotesContext for global state |
| **Custom Hooks** | useAuth, useNotes, useDebounce |
| **Interceptors** | Axios for token injection & auto-refresh |
| **Provider Pattern** | AuthProvider, NotesProvider wrap app |
| **Debouncing** | Search input, auto-save |
| **Protected Routes** | Redirect unauthenticated users |

---

## Routing (React Router v6)

```javascript
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route path="/signup" element={<SignupPage />} />
  <Route path="/notes" element={
    <ProtectedRoute>
      <NotesProvider>
        <NotesPage />
      </NotesProvider>
    </ProtectedRoute>
  } />
  <Route path="/" element={<Navigate to="/notes" />} />
</Routes>
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| react-router-dom | Navigation & routing |
| axios | HTTP client |
| @tiptap/react | Rich text editor |
| @tiptap/starter-kit | Editor extensions |
| tailwindcss | Styling |