package configs

import (
	"testing"
	"time"
)

func TestLoadTrashRetention(t *testing.T) {
	cases := []struct {
		name    string
		env     string
		want    time.Duration
		wantErr bool
	}{
		{"unset uses 30 days", "", 30 * 24 * time.Hour, false},
		{"hours", "48h", 48 * time.Hour, false},
		{"short, for testing", "5s", 5 * time.Second, false},
		{"not a duration", "30", 0, true},
		{"zero", "0s", 0, true},
		{"negative", "-1h", 0, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("TRASH_RETENTION", tc.env)
			cfg, err := Load()
			if tc.wantErr {
				if err == nil {
					t.Fatalf("Load() = %+v, want an error", cfg)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if cfg.TrashRetention != tc.want {
				t.Errorf("TrashRetention = %v, want %v", cfg.TrashRetention, tc.want)
			}
		})
	}
}
