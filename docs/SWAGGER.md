# API Documentation (Swagger)

## Overview

The backend uses [`swaggo/swag`](https://github.com/swaggo/swag) to generate an OpenAPI 2.0 spec from Go doc-comment annotations on handler functions, and [`gin-swagger`](https://github.com/swaggo/gin-swagger) to serve an interactive Swagger UI.

---

## Where things live

```
backend/
├── cmd/server/
│   ├── main.go          # @title/@version/@BasePath (/api/v1) + BearerAuth security scheme
│   └── router.go        # mounts GET /swagger/*any
├── internal/services/
│   ├── auth_service.go     # @Router annotations for /auth/*
│   ├── user_service.go     # @Router annotations for /users/me
│   └── items_service.go    # @Router annotations for /items*, named request DTOs
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
router := NewRouter(authService, userService, itemsService, tokenService, cfg.IsDevelopment())
```

This is driven by the `APP_ENV` env var (`internal/configs/config.go`):

| `APP_ENV` value | Swagger UI |
|---|---|
| unset, or `development` | served |
| anything else (`staging`, `production`, ...) | not registered — `/swagger/*` 404s |

Only `development` serves the UI, so a staging or production deployment never exposes the API docs. An unset `APP_ENV` counts as `development`.

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
   // @Router       /widgets [post]
   func (h *WidgetsHandler) CreateWidget(c *gin.Context) { ... }
   ```

3. Omit `@Security BearerAuth` for routes outside the `protected` group (`/auth/*`).
4. Run `make swagger` and confirm the new path shows up in `docs/swagger.json`.

---

## Notes / gotchas

- **`swag` CLI vs. `swaggo/swag` library version must match.** The generated `docs.go` uses fields (`LeftDelim`/`RightDelim` on `swag.Spec`) that only exist in newer `swaggo/swag` releases. `make tools` keeps the CLI binary current, but not the library dependency recorded in `go.mod` — if `go build`/`make build` fails on `docs/docs.go` with "unknown field" errors, run `go get github.com/swaggo/swag@latest github.com/swaggo/gin-swagger@latest` once to bring the library dependency in line with the CLI version, then `make tidy`.
- **`@Router` paths are relative to the base path.** `main.go` sets `@BasePath /api/v1`, so annotate `/items`, not `/api/v1/items`.
- **Only routed endpoints are annotated.** Don't annotate a handler that isn't wired into `router.go` — it would document a route that doesn't exist.
- **Auth scheme**: JWT is passed as `Authorization: Bearer <token>`, declared once in `main.go` via `@securityDefinitions.apikey BearerAuth`, and referenced per-route with `@Security BearerAuth`.
