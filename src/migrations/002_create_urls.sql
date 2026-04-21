CREATE TABLE urls (
  id           BIGINT PRIMARY KEY,
  code         VARCHAR(12) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_urls_code ON urls(code);
CREATE INDEX idx_urls_user_id ON urls(user_id);
