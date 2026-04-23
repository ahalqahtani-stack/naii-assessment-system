CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(200),
  role VARCHAR(50) DEFAULT 'admin',
  dept VARCHAR(200),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  question_code VARCHAR(50) NOT NULL,
  level INTEGER,
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(question_code)
);

CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  pillar VARCHAR(100) NOT NULL,
  sub VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  dept VARCHAR(200),
  current_level INTEGER,
  target_level INTEGER,
  barriers TEXT,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(pillar, sub, name)
);

CREATE TABLE IF NOT EXISTS evidence (
  id SERIAL PRIMARY KEY,
  question_code VARCHAR(50) NOT NULL,
  level INTEGER NOT NULL,
  has_doc BOOLEAN DEFAULT FALSE,
  owner_dept VARCHAR(200),
  target_date DATE,
  file_path VARCHAR(500),
  file_name VARCHAR(300),
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(question_code, level)
);

CREATE TABLE IF NOT EXISTS plan_phases (
  id SERIAL PRIMARY KEY,
  phase_num INTEGER NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  updated_by INTEGER REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(phase_num)
);

CREATE TABLE IF NOT EXISTS plan_tasks (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id),
  from_level INTEGER,
  to_level INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plan_overrides (
  id SERIAL PRIMARY KEY,
  domain_id INTEGER REFERENCES domains(id),
  target_level INTEGER,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  entity_id INTEGER,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Default admin user (password: admin123)
INSERT INTO users (username, password_hash, name, role, dept)
VALUES ('admin', 'admin123', 'مدير النظام', 'admin', 'البنية المؤسسية')
ON CONFLICT (username) DO NOTHING;
