-- ============================================================
-- NAII Assessment System — Database Schema
-- Version: 1.0
-- Date: April 2026
-- ============================================================

-- 1. USERS
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(200),
  role VARCHAR(50) NOT NULL DEFAULT 'department',
  dept VARCHAR(200),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_role CHECK (role IN ('super_admin', 'admin', 'department'))
);

-- 2. ASSESSMENTS
CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  question_code VARCHAR(50) NOT NULL UNIQUE,
  level INTEGER CHECK (level >= 0 AND level <= 5),
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. DOMAINS
CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  pillar VARCHAR(100) NOT NULL,
  sub VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  dept VARCHAR(200),
  current_level INTEGER CHECK (current_level >= 0 AND current_level <= 5),
  target_level INTEGER CHECK (target_level >= 0 AND target_level <= 5),
  barriers TEXT,
  notes TEXT,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(pillar, sub, name)
);

-- 4. EVIDENCE
CREATE TABLE IF NOT EXISTS evidence (
  id SERIAL PRIMARY KEY,
  question_code VARCHAR(50) NOT NULL,
  level INTEGER NOT NULL CHECK (level >= 0 AND level <= 5),
  has_doc BOOLEAN DEFAULT FALSE,
  owner_dept VARCHAR(200),
  target_date DATE,
  file_path VARCHAR(500),
  file_name VARCHAR(300),
  file_size INTEGER,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'not_uploaded',
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMP,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_notes TEXT,
  reviewed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(question_code, level),
  CONSTRAINT chk_status CHECK (status IN ('not_uploaded', 'uploaded', 'approved', 'rejected'))
);

-- 5. PLAN PHASES
CREATE TABLE IF NOT EXISTS plan_phases (
  id SERIAL PRIMARY KEY,
  phase_num INTEGER NOT NULL UNIQUE,
  status VARCHAR(50) DEFAULT 'pending',
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT chk_phase_status CHECK (status IN ('pending', 'in_progress', 'completed'))
);

-- 6. PLAN TASKS
CREATE TABLE IF NOT EXISTS plan_tasks (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  from_level INTEGER,
  to_level INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 7. PLAN OVERRIDES
CREATE TABLE IF NOT EXISTS plan_overrides (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id) ON DELETE CASCADE,
  target_level INTEGER,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 8. AUDIT LOG
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

-- 9. NOTIFICATIONS
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

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_assessments_code ON assessments(question_code);
CREATE INDEX IF NOT EXISTS idx_domains_pillar ON domains(pillar, sub, name);
CREATE INDEX IF NOT EXISTS idx_evidence_code ON evidence(question_code, level);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- ============================================================
-- NOTE: Super admin should be created manually on first deploy
-- Do NOT use default admin/admin123 in production
-- Example:
-- INSERT INTO users (username, password_hash, name, role, is_active, must_change_password)
-- VALUES ('your_username', 'bcrypt_hash_here', 'Your Name', 'super_admin', TRUE, TRUE);
-- ============================================================
