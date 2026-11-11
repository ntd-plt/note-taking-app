package session

import (
	"net/http"
	"time"
)

// CookieName is the cookie that carries the session id.
const CookieName = "sid"

// Cookie writes and reads the session cookie. It is HttpOnly, so page scripts
// cannot read it, and SameSite=Lax, so other sites' requests do not carry it.
type Cookie struct {
	// Secure sends the cookie over HTTPS only. Turn it off only for local
	// development over plain http.
	Secure bool
	// MaxAge is how long the browser keeps the cookie.
	MaxAge time.Duration
}

// Set gives the browser the session id.
func (c Cookie) Set(w http.ResponseWriter, id string) {
	http.SetCookie(w, c.cookie(id, int(c.MaxAge/time.Second)))
}

// Clear tells the browser to forget the session cookie.
func (c Cookie) Clear(w http.ResponseWriter) {
	http.SetCookie(w, c.cookie("", -1))
}

// Read returns the session id the browser sent, or "" if there is none.
func (c Cookie) Read(r *http.Request) string {
	ck, err := r.Cookie(CookieName)
	if err != nil {
		return ""
	}
	return ck.Value
}

func (c Cookie) cookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   c.Secure,
		SameSite: http.SameSiteLaxMode,
	}
}
