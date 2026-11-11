-- users.email is UNIQUE, which already gives it an index.
DROP INDEX IF EXISTS idx_users_email;
