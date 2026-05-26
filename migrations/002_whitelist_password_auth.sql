ALTER TABLE authorized_emails
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE authorized_emails
  ADD COLUMN IF NOT EXISTS password_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_authorized_emails_active
  ON authorized_emails (active);

COMMENT ON COLUMN authorized_emails.password_hash IS
  'Password hash format: scrypt$N$r$p$salt_hex$hash_hex';
