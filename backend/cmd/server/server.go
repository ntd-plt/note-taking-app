package main

import (
	"context"
	"errors"
	"log"
	"net"
	"net/http"
	"time"
)

const (
	// readHeaderTimeout stops a client that sends its headers slowly to hold a
	// connection open (slowloris).
	readHeaderTimeout = 5 * time.Second
	// readTimeout covers reading the whole request, up to the 2 MB body limit.
	readTimeout = 15 * time.Second
	// writeTimeout bounds writing a response; signup's email check alone can take
	// up to 8 seconds.
	writeTimeout = 30 * time.Second
	// idleTimeout closes keep-alive connections left unused.
	idleTimeout = 60 * time.Second
	// shutdownGrace is how long in-flight requests get to finish on shutdown.
	// Hosting providers allow about 30 seconds after SIGTERM.
	shutdownGrace = 10 * time.Second
)

// newHTTPServer is the API's HTTP server, with timeouts so slow or idle clients
// cannot hold connections forever.
func newHTTPServer(addr string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}
}

// serve runs srv on ln until ctx is done, then shuts it down gracefully: it stops
// taking new connections and waits up to grace for in-flight requests to finish.
// It returns nil after a clean shutdown.
func serve(ctx context.Context, srv *http.Server, ln net.Listener, grace time.Duration) error {
	errs := make(chan error, 1)
	go func() { errs <- srv.Serve(ln) }()

	select {
	case err := <-errs:
		// The server stopped by itself: that is a failure, never a shutdown.
		return err
	case <-ctx.Done():
	}

	log.Printf("shutting down: waiting up to %v for requests in flight", grace)
	shutdownCtx, cancel := context.WithTimeout(context.Background(), grace)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errs; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
