-- ============================================================
-- NAII Assessment System — Upgrade Script
-- Run this on existing databases to apply all schema changes
-- Safe to run multiple times (all statements are idempotent)
-- Version: 1.1
-- ============================================================

-- Users table upgrades
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Domains table upgrades
ALTER TABLE domains ADD COLUMN IF NOT EXISTS responsible VARCHAR(200);

-- Evidence table upgrades
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'not_uploaded';
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE evidence ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- Constraints (safe: fails silently if already exists)
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT chk_role CHECK (role IN ('super_admin', 'admin', 'department'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE evidence ADD CONSTRAINT chk_status CHECK (status IN ('not_uploaded', 'uploaded', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE plan_phases ADD CONSTRAINT chk_phase_status CHECK (status IN ('pending', 'in_progress', 'completed'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_assessments_code ON assessments(question_code);
CREATE INDEX IF NOT EXISTS idx_domains_pillar ON domains(pillar, sub, name);
CREATE INDEX IF NOT EXISTS idx_evidence_code ON evidence(question_code, level);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Notifications table (if not exists from original schema)
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'info',
  entity_type VARCHAR(50),
  entity_id INTEGER,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Audit log table (if not exists from original schema)
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  entity_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

SELECT 'Upgrade complete. Schema version: 1.1' AS status;
