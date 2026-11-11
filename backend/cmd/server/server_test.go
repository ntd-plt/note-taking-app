package main

import (
	"context"
	"io"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestNewHTTPServerHasTimeouts(t *testing.T) {
	srv := newHTTPServer(":0", http.NotFoundHandler())
	for name, got := range map[string]time.Duration{
		"ReadHeaderTimeout": srv.ReadHeaderTimeout,
		"ReadTimeout":       srv.ReadTimeout,
		"WriteTimeout":      srv.WriteTimeout,
		"IdleTimeout":       srv.IdleTimeout,
	} {
		if got <= 0 {
			t.Errorf("%s is %v, want a limit", name, got)
		}
	}
}

func listen(t *testing.T) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	return ln
}

func TestServeLetsRequestsInFlightFinishOnShutdown(t *testing.T) {
	started := make(chan struct{})
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		time.Sleep(300 * time.Millisecond) // a slow save, still running at shutdown
		_, _ = io.WriteString(w, "saved")
	})
	ln := listen(t)
	url := "http://" + ln.Addr().String()
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- serve(ctx, newHTTPServer(ln.Addr().String(), handler), ln, 5*time.Second) }()

	type result struct {
		body string
		err  error
	}
	resp := make(chan result, 1)
	go func() {
		r, err := http.Get(url)
		if err != nil {
			resp <- result{err: err}
			return
		}
		defer r.Body.Close()
		b, err := io.ReadAll(r.Body)
		resp <- result{string(b), err}
	}()

	<-started
	cancel() // SIGTERM arrives while the request is running

	if r := <-resp; r.err != nil || r.body != "saved" {
		t.Errorf("request in flight: body %q, err %v; want it to finish", r.body, r.err)
	}
	if err := <-done; err != nil {
		t.Errorf("serve returned %v after a clean shutdown, want nil", err)
	}
	if _, err := http.Get(url); err == nil {
		t.Error("the server still accepts requests after shutdown")
	}
}

func TestServeReportsAServerThatStopsByItself(t *testing.T) {
	ln := listen(t)
	srv := newHTTPServer(ln.Addr().String(), http.NotFoundHandler())
	done := make(chan error, 1)
	go func() { done <- serve(context.Background(), srv, ln, time.Second) }()

	_ = ln.Close() // the listener dies under the server

	select {
	case err := <-done:
		if err == nil {
			t.Error("serve returned nil when the server stopped by itself")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("serve did not return")
	}
}
