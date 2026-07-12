# API Documentation (Swagger)

## Overview

The backend uses [`swaggo/swag`](https://github.com/swaggo/swag) to generate an OpenAPI 2.0 spec from Go doc-comment annotations on handler functions, and [`gin-swagger`](https://github.com/swaggo/gin-swagger) to serve an interactive Swagger UI.

---

## Where things live

```
backend/
├── cmd/server/
│   ├── main.go          # @title/@version/@BasePath + BearerAuth security scheme
│   └── router.go        # mounts GET /swagger/*any
├── internal/handlers/
│   ├── auth_handler.go     # @Router annotations for /auth/*
│   ├── notes_handler.go    # @Router annotations for /api/notes*, named request DTOs
│   └── folders_handler.go  # @Router annotations for /api/folders*, named request DTOs
└── docs/                 # generated — do not edit by hand
    ├── docs.go           # embeds the spec, imported for side effects in router.go
    ├── swagger.json
    └── swagger.yaml
```

---

## Viewing the docs

```bash
cd backend
make run
```

Then open **http://localhost:8080/swagger/index.html**. Requires a running Postgres instance — see `backend/README.md` (`make setup` gets you there).

---

## Dev-only: the UI is not served in production

`router.NewRouter` takes an `enableSwagger bool` and only registers `GET /swagger/*any` when it's `true`. `main.go` derives this from config:

```go
router := NewRouter(authHandler, notesHandler, foldersHandler, tokenService, !cfg.IsProduction())
```

This is driven by the `APP_ENV` env var (`internal/configs/config.go`):

| `APP_ENV` value | Swagger UI |
|---|---|
| unset, or anything other than `production` | served |
| `production` | not registered — `/swagger/*` 404s |

Set `APP_ENV=production` in your production `.env`/deployment env to disable it. The default (unset) is dev-safe, i.e. Swagger stays on unless explicitly turned off.

Note this only stops the route from being *registered* — `docs/docs.go` (the embedded spec) still compiles into the production binary either way. If you also want it excluded from the binary itself, that would require a Go build tag around the `_ "backend/docs"` import and the `swag`-generated file, which isn't set up here.

---

## Regenerating after handler changes

Any time a `@Router`/`@Param`/`@Success` annotation changes, or a new endpoint is added, regenerate `backend/docs`:

```bash
cd backend
make swagger
```

That target runs `swag init -g cmd/server/main.go --output docs --parseDependency --parseInternal` using the `swag` binary installed by `make tools` (part of `make setup`).

The generated `docs/` package must be rebuilt (not hand-edited) and committed alongside the annotation changes, since `router.go` imports it directly:

```go
_ "backend/docs"
```

---

## Adding docs to a new endpoint

1. Give the handler's request body a **named** struct type (anonymous inline structs can't be introspected by `swag`).
2. Add a doc-comment block directly above the handler function, e.g.:

   ```go
   // CreateWidget godoc
   // @Summary      Create a widget
   // @Description  Creates a new widget for the authenticated user
   // @Tags         widgets
   // @Accept       json
   // @Produce      json
   // @Security     BearerAuth
   // @Param        request  body      CreateWidgetRequest  true  "Widget to create"
   // @Success      201      {object}  model.Widget
   // @Failure      400      {object}  map[string]string
   // @Failure      500      {object}  map[string]string
   // @Router       /api/widgets [post]
   func (h *WidgetsHandler) CreateWidget(c *gin.Context) { ... }
   ```

3. Omit `@Security BearerAuth` for routes outside the `protected` group (`/auth/*`).
4. Run `make swagger` and confirm the new path shows up in `docs/swagger.json`.

---

## Notes / gotchas

- **`swag` CLI vs. `swaggo/swag` library version must match.** The generated `docs.go` uses fields (`LeftDelim`/`RightDelim` on `swag.Spec`) that only exist in newer `swaggo/swag` releases. `make tools` keeps the CLI binary current, but not the library dependency recorded in `go.mod` — if `go build`/`make build` fails on `docs/docs.go` with "unknown field" errors, run `go get github.com/swaggo/swag@latest github.com/swaggo/gin-swagger@latest` once to bring the library dependency in line with the CLI version, then `make tidy`.
- **Only routed endpoints are annotated.** `NotesHandler.GetNotes` exists but isn't wired into `router.go`, so it intentionally has no `@Router` annotation — annotating it would document a route that doesn't exist.
- **Auth scheme**: JWT is passed as `Authorization: Bearer <token>`, declared once in `main.go` via `@securityDefinitions.apikey BearerAuth`, and referenced per-route with `@Security BearerAuth`.
