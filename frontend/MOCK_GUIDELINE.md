# MSW Mocking Guidelines (FSD-Compliant)

This document outlines the architecture and conventions for writing Mock Service Worker (MSW) handlers in our project using **Feature-Sliced Design (FSD)**.

---

## 📖 Architecture & Philosophy

In Feature-Sliced Design, we avoid large, monolithic configuration files. Instead, code is distributed across modular **layers**, **slices**, and **segments**. Mocks should follow this structure.

### 1. Slice Co-location (Per-Slice)

Do not keep all mock handlers in a single global `handlers` array file. Instead:

- Put entity-specific API mocks in the `api` segment of the entity slice (e.g., `src/entities/<entity-name>/api/`).
- Put feature-specific API mocks (e.g., login, form submissions) in the `api` segment of the feature slice (e.g., `src/features/<feature-name>/api/`).

### 2. Global Aggregation

The `app` layer (or a root `mocks` folder) aggregates all handlers into a single array for initializing the MSW worker (browser) or server (node/testing).

---

## 📁 File Structure

Here is how our mocking files are structured:

```text
src/
├── mocks/
│   ├── browser.ts         # Registers service worker for client development
│   ├── server.ts          # Registers mock server for unit/integration tests
│   ├── state.ts           # Shared in-memory mock database / session state
│   └── handler.ts         # Central aggregator of all slice-based handlers
├── entities/
│   └── user/
│       └── api/
│           └── user.handlers.ts   # Mocks for GET /api/me, user profiles, etc.
└── features/
    └── auth/
        └── api/
            └── auth.handlers.ts   # Mocks for POST /api/auth/login, logout, etc.
```

---

## 🛠️ Step-by-Step Guide to Adding a New Mock

### 1. Write the Slice-Specific Handlers

Create a file named `<slice-name>.handlers.ts` in the `api` segment of your slice.

Example: `src/entities/note/api/note.handlers.ts`

```typescript
import { http, HttpResponse } from 'msw'

export const noteHandlers = [
  http.get('/api/notes', () => {
    return HttpResponse.json([
      { id: '1', title: 'My First Note', content: 'Hello World!' },
    ])
  }),
]
```

### 2. Handle Shared In-Memory State (If Applicable)

If your mocks need to share state (e.g., simulating logging in, updating a user profile, and then fetching `/api/me` which returns that updated user):

- Use the shared state store located at [src/mocks/state.ts](file:///home/ltp/projects/note-taking-app/frontend/src/mocks/state.ts).
- Import and mutate/read it in your slice handlers.

Example of mutation:

```typescript
import { mockState } from '#/mocks/state'

// Inside a handler:
mockState.currentUser = loggedInUser
```

### 3. Aggregate in the Root Handler

Import your new handlers and spread them into the `handlers` array inside [src/mocks/handler.ts](file:///home/ltp/projects/note-taking-app/frontend/src/mocks/handler.ts):

```diff
  // src/mocks/handler.ts
  import { userHandlers } from '#/entities/user/api/user.handlers'
  import { authHandlers } from '#/features/auth/api/auth.handlers'
+ import { noteHandlers } from '#/entities/note/api/note.handlers'

  export const handlers = [
    ...userHandlers,
    ...authHandlers,
+   ...noteHandlers,
  ]
```

---

## 💡 Best Practices

1. **Avoid Duplicating Mock Logic**: Use shared helper functions in `shared/api` if mock generation/transformation logic is complex.
2. **Keep State Simple**: The shared in-memory database at [src/mocks/state.ts](file:///home/ltp/projects/note-taking-app/frontend/src/mocks/state.ts) should only contain plain JS objects that reset when the page refreshes.
3. **No Direct MSW Startup imports in slices**: A slice should never configure or start MSW directly. Slices only export handler definitions. Only the `app` or root `mocks` initialization scripts can call `setupWorker` or `setupServer`.
