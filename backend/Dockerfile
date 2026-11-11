# syntax=docker/dockerfile:1

FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN go build -o bin/server ./cmd/server && go build -o bin/dburl ./cmd/dburl
RUN go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.20.1

FROM alpine:3.24

RUN apk add --no-cache ca-certificates && addgroup -S app && adduser -S -G app app

WORKDIR /app

COPY --from=builder /app/bin/server ./server
COPY --from=builder /app/bin/dburl ./dburl
COPY --from=builder /go/bin/migrate /usr/local/bin/migrate
COPY migrations ./migrations
COPY --chmod=755 entrypoint.sh ./entrypoint.sh

USER app

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]
