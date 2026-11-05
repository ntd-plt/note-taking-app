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
│   ├── user/
│   │   └── api/
│   │       └── user.handlers.ts   # Mocks for GET /api/me, user profiles, etc.
│   └── item/
│       └── api/
│           ├── item.handlers.ts   # Mocks for /items/:id, /workspace, /pages, /ops, /items/:id/duplicate, /trash*
│           ├── mockTree.ts        # The item tree and its rules, ported from backend/internal/tree
│           └── mockSeed.ts        # The sample workspace the mocks start with
└── features/
    └── auth/
        └── api/
            └── auth.handlers.ts   # Mocks for POST /api/v1/auth/login, logout, etc.
```

---

## 🛠️ Step-by-Step Guide to Adding a New Mock

### 1. Write the Slice-Specific Handlers

Create a file named `<slice-name>.handlers.ts` in the `api` segment of your slice.

Example: `src/entities/tag/api/tag.handlers.ts`

```typescript
import { http, HttpResponse } from 'msw'

export const tagHandlers = [
  http.get('/api/v1/tags', () => {
    return HttpResponse.json([{ id: '1', name: 'Work' }])
  }),
]
```

### 2. Handle Shared In-Memory State (If Applicable)

If your mocks need to share state (e.g., simulating logging in, updating a user profile, and then fetching `/api/me` which returns that updated user):

- Use the shared state store located at [src/mocks/state.ts](src/mocks/state.ts).
- Import and mutate/read it in your slice handlers.

Example of mutation:

```typescript
import { mockState } from '#/mocks/state'

// Inside a handler:
mockState.currentUser = loggedInUser
```

### 3. Aggregate in the Root Handler

Import your new handlers and spread them into the `handlers` array inside [src/mocks/handler.ts](src/mocks/handler.ts):

```diff
  // src/mocks/handler.ts
  import { userHandlers } from '#/entities/user/api/user.handlers'
  import { authHandlers } from '#/features/auth/api/auth.handlers'
+ import { tagHandlers } from '#/entities/tag/api/tag.handlers'

  export const handlers = [
    ...userHandlers,
    ...authHandlers,
+   ...tagHandlers,
  ]
```

---

## 🌳 The item tree mocks

Pages and blocks are mocked by `src/entities/item/api/`. Unlike the other mocks, these follow the server's rules exactly, so the editor and sidebar can be tested against them as if against the real API:

- `mockTree.ts` is a TypeScript port of `backend/internal/tree`: positions, the trailing-paragraph rule, cycles, prop defaults and checks, all-or-nothing batches with `op_index` on errors, duplicate, trash, restore and the 30-day retention. A change to the server's rules needs the same change here, with a test in `item.handlers.test.ts`.
- `mockSeed.ts` builds the sample workspace through the same rules (`seedTree`), so the seed is always a valid tree.
- The state lives in `item.handlers.ts`, not in `src/mocks/state.ts`. Tests reset and inspect it with:

  ```typescript
  import {
    mockPageIds,
    mockTree,
    resetMockTree,
  } from '#/entities/item/api/item.handlers'

  afterEach(() => resetMockTree()) // back to the sample workspace
  resetMockTree({ empty: true }) // a workspace with no pages
  const ids = mockPageIds() // page ids by name, e.g. ids.Work
  mockTree().items.get(ids.Work) // the raw item, as the server would store it
  ```

---

## 💡 Best Practices

1. **Avoid Duplicating Mock Logic**: Use shared helper functions in `shared/api` if mock generation/transformation logic is complex.
2. **Keep State Simple**: The shared in-memory database at [src/mocks/state.ts](src/mocks/state.ts) should only contain plain JS objects that reset when the page refreshes.
3. **No Direct MSW Startup imports in slices**: A slice should never configure or start MSW directly. Slices only export handler definitions. Only the `app` or root `mocks` initialization scripts can call `setupWorker` or `setupServer`.
