require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { error: 'Too many requests, please try again later' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' }
});
app.use('/api/', apiLimiter);

// Static files
app.use(express.static('public'));

// JWT secret
const JWT_SECRET = process.env.JWT_SECRET || 'naii_jwt_secret_2026_nelc';
const JWT_EXPIRES = '24h';

// Database
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS
});

// File upload config
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._؀-ۿ-]/g, '_');
      cb(null, Date.now() + '-' + safeName);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.png','.jpg','.jpeg','.zip'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed'));
  }
});

// JWT Auth middleware
function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Admin-only middleware
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function adminOrSuper(req, res, next) {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Admin access required' });
  next();
}

function superAdminOnly(req, res, next) {
  if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Super admin access required' });
  next();
}

// Password generation (cryptographically random, meets validatePassword requirements)
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  let pass = '';
  pass += upper[crypto.randomInt(upper.length)];
  pass += lower[crypto.randomInt(lower.length)];
  pass += digits[crypto.randomInt(digits.length)];
  pass += special[crypto.randomInt(special.length)];
  const all = upper + lower + digits + special;
  for (let i = 0; i < 8; i++) pass += all[crypto.randomInt(all.length)];
  return pass.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

function validatePassword(password, username) {
  const errors = [];
  if (password.length < 8) errors.push('يجب أن تكون 8 أحرف على الأقل');
  if (!/[A-Z]/.test(password)) errors.push('يجب أن تحتوي على حرف كبير واحد على الأقل');
  if (!/[a-z]/.test(password)) errors.push('يجب أن تحتوي على حرف صغير واحد على الأقل');
  if (!/[0-9]/.test(password)) errors.push('يجب أن تحتوي على رقم واحد على الأقل');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('يجب أن تحتوي على رمز خاص واحد على الأقل (!@#$%^&*)');
  if (username && password.toLowerCase().includes(username.toLowerCase())) errors.push('يجب ألا تحتوي على اسم المستخدم');
  const common = ['password','123456','12345678','qwerty','admin123','letmein','welcome','Password1'];
  if (common.includes(password.toLowerCase())) errors.push('كلمة المرور شائعة جداً');
  return errors;
}

async function logAudit(userId, action, entity, entityId, oldValue, newValue) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_id, action, entity, entity_id, old_value, new_value)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, action, entity, entityId, oldValue ? JSON.stringify(oldValue) : null, newValue ? JSON.stringify(newValue) : null]
    );
  } catch (e) {
    console.warn('audit log failed:', e.message);
  }
}

// Health check (no auth)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- AUTH ---
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'Username and password required' });

    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.json({ success: false, error: 'اسم المستخدم غير موجود' });

    const user = result.rows[0];

    // Support both bcrypt and plain text (migration period)
    let validPassword = false;
    if (user.password_hash.startsWith('$2')) {
      validPassword = await bcrypt.compare(password, user.password_hash);
    } else {
      validPassword = (user.password_hash === password);
      // Auto-upgrade to bcrypt on successful plain-text login
      if (validPassword) {
        const hashed = await bcrypt.hash(password, 10);
        await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashed, user.id]);
      }
    }

    if (!validPassword) return res.json({ success: false, error: 'كلمة المرور غير صحيحة' });

    if (user.is_active === false) return res.json({ success: false, error: 'الحساب معطّل — تواصل مع مدير النظام' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, dept: user.dept, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    await logAudit(user.id, 'login', 'users', user.id, null, { username: user.username });
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, role: user.role, dept: user.dept },
      must_change_password: user.must_change_password || false
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password) return res.status(400).json({ error: 'Password required' });
    const errors = validatePassword(new_password, req.user.username);
    if (errors.length > 0) return res.status(400).json({ error: errors.join(' · ') });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [hashed, req.user.id]);
    await logAudit(req.user.id, 'change_password', 'users', req.user.id, null, null);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- ASSESSMENTS (protected) ---
app.get('/api/assessment', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assessments ORDER BY question_code');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/assessment', authMiddleware, async (req, res) => {
  try {
    const { assessments } = req.body;
    if (!Array.isArray(assessments)) return res.status(400).json({ error: 'Invalid data' });
    for (const a of assessments) {
      await pool.query(
        `INSERT INTO assessments (question_code, level, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (question_code) DO UPDATE SET level = $2, updated_by = $3, updated_at = NOW()`,
        [a.question_code, a.level, req.user.id]
      );
    }
    res.json({ success: true, count: assessments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/assessment', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'هذا الإجراء متاح فقط للمدير الرئيسي' });
    const old = await pool.query('SELECT * FROM assessments');
    await pool.query('DELETE FROM assessments');
    await pool.query('UPDATE domains SET current_level = NULL');
    await logAudit(req.user.id, 'reset_all_assessments', 'assessments', null, { count: old.rows.length }, null);
    res.json({ success: true, deleted: old.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DOMAINS (protected) ---
app.get('/api/domains', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM domains ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/domains', authMiddleware, async (req, res) => {
  try {
    const { domains } = req.body;
    if (!Array.isArray(domains)) return res.status(400).json({ error: 'Invalid data' });
    for (const d of domains) {
      await pool.query(
        `INSERT INTO domains (pillar, sub, name, dept, current_level, target_level, barriers, notes, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (pillar, sub, name) DO UPDATE SET
           dept = $4, current_level = $5, target_level = $6, barriers = $7, notes = $8, updated_at = NOW()`,
        [d.pillar, d.sub, d.name, d.dept, d.current_level, d.target_level, d.barriers, d.notes]
      );
    }
    res.json({ success: true, count: domains.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- PLAN (protected) ---
app.get('/api/plan', authMiddleware, async (req, res) => {
  try {
    const phases = await pool.query('SELECT * FROM plan_phases ORDER BY phase_num');
    const tasks = await pool.query('SELECT * FROM plan_tasks ORDER BY id');
    const overrides = await pool.query('SELECT * FROM plan_overrides ORDER BY id');
    res.json({ phases: phases.rows, tasks: tasks.rows, overrides: overrides.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/plan', authMiddleware, async (req, res) => {
  try {
    const { phases, tasks, overrides } = req.body;
    if (phases && Array.isArray(phases)) {
      for (const p of phases) {
        await pool.query(
          `INSERT INTO plan_phases (phase_num, status, updated_by, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (phase_num) DO UPDATE SET status = $2, updated_by = $3, updated_at = NOW()`,
          [p.phase_num, p.status, req.user.id]
        );
      }
    }
    if (tasks && Array.isArray(tasks)) {
      await pool.query('DELETE FROM plan_tasks');
      for (const t of tasks) {
        await pool.query(
          `INSERT INTO plan_tasks (domain_id, from_level, to_level, status, notes, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [t.domain_id, t.from_level, t.to_level, t.status || 'pending', t.notes]
        );
      }
    }
    if (overrides && Array.isArray(overrides)) {
      for (const o of overrides) {
        await pool.query(
          `INSERT INTO plan_overrides (domain_id, target_level, notes, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT DO NOTHING`,
          [o.domain_id, o.target_level, o.notes]
        );
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVIDENCE (protected) ---
app.get('/api/evidence', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM evidence ORDER BY question_code, level');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/evidence/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { question_code, level } = req.body;
    if (!question_code || level === undefined) return res.status(400).json({ error: 'question_code and level required' });

    const result = await pool.query(
      `INSERT INTO evidence (question_code, level, has_doc, file_path, file_name, file_size, status, uploaded_by, uploaded_at, updated_at)
       VALUES ($1, $2, true, $3, $4, $5, 'uploaded', $6, NOW(), NOW())
       ON CONFLICT (question_code, level) DO UPDATE SET
         has_doc = true, file_path = $3, file_name = $4, file_size = $5,
         status = 'uploaded', uploaded_by = $6, uploaded_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [question_code, parseInt(level), req.file.path, req.file.originalname, req.file.size, req.user.id]
    );

    const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, entity_type, entity_id)
         VALUES ($1, $2, 'evidence_uploaded', 'evidence', $3)`,
        [admin.id, 'تم رفع ملف جديد لـ ' + question_code + ' المستوى ' + level, result.rows[0].id]
      );
    }

    res.json({ success: true, evidence: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/evidence/:id/approve', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE evidence SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [req.user.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const ev = result.rows[0];
    if (ev.uploaded_by) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, entity_type, entity_id)
         VALUES ($1, $2, 'evidence_approved', 'evidence', $3)`,
        [ev.uploaded_by, 'تم اعتماد الملف الخاص بـ ' + ev.question_code + ' المستوى ' + ev.level, ev.id]
      );
    }
    res.json({ success: true, evidence: ev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/evidence/:id/reject', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    const { review_notes } = req.body;
    if (!review_notes) return res.status(400).json({ error: 'Rejection reason required' });

    const result = await pool.query(
      `UPDATE evidence SET status = 'rejected', reviewed_by = $1, review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [req.user.id, review_notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const ev = result.rows[0];
    if (ev.uploaded_by) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, entity_type, entity_id)
         VALUES ($1, $2, 'evidence_rejected', 'evidence', $3)`,
        [ev.uploaded_by, 'تم رفض الملف الخاص بـ ' + ev.question_code + ' المستوى ' + ev.level + ' — السبب: ' + review_notes, ev.id]
      );
    }
    res.json({ success: true, evidence: ev });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- NOTIFICATIONS (protected) ---
app.get('/api/notifications', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications/unread-count', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/:id/read', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/notifications/read-all', authMiddleware, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- USERS (admin only) ---
app.get('/api/users', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    let query;
    if (req.user.role === 'super_admin') {
      query = 'SELECT id, username, name, role, dept, must_change_password, last_login_at, is_active, created_at FROM users ORDER BY id';
    } else {
      query = 'SELECT id, username, name, role, dept, must_change_password, last_login_at, is_active, created_at FROM users WHERE is_active = TRUE AND role != $1 ORDER BY id';
    }
    const result = req.user.role === 'super_admin' ? await pool.query(query) : await pool.query(query, ['super_admin']);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    const { username, name, role, dept } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    if (req.user.role !== 'super_admin' && (req.body.role === 'admin' || req.body.role === 'super_admin')) {
      return res.status(403).json({ error: 'لا يمكنك منح هذه الصلاحية — تواصل مع المدير الرئيسي' });
    }

    const tempPassword = generatePassword();
    const hashed = await bcrypt.hash(tempPassword, 10);
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, dept, must_change_password)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING id, username, name, role, dept, must_change_password, created_at`,
      [username, hashed, name || '', role || 'department', dept || '']
    );
    await logAudit(req.user.id, 'create_user', 'users', result.rows[0].id, null, { username, role, dept });
    res.json({ success: true, user: result.rows[0], temp_password: tempPassword });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    const targetUser = await pool.query('SELECT role FROM users WHERE id = $1', [req.params.id]);
    if (targetUser.rows.length > 0 && targetUser.rows[0].role === 'super_admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'لا يمكن تعديل المدير الرئيسي' });
    }
    // Prevent admin from editing other admin users
    if (targetUser.rows[0].role === 'admin' && req.user.role !== 'super_admin') {
      return res.status(403).json({ error: 'لا يمكن تعديل مدير نظام آخر — تواصل مع المدير الرئيسي' });
    }
    // Prevent demoting the last super_admin
    if (targetUser.rows[0].role === 'super_admin' && req.body.role !== 'super_admin') {
      const superCount = await pool.query("SELECT COUNT(*) as count FROM users WHERE role = 'super_admin' AND is_active = TRUE");
      if (parseInt(superCount.rows[0].count) <= 1) {
        return res.status(400).json({ error: 'لا يمكن تغيير دور المدير الرئيسي الوحيد — يجب وجود مدير رئيسي واحد على الأقل' });
      }
    }
    if (req.user.role !== 'super_admin' && (req.body.role === 'admin' || req.body.role === 'super_admin')) {
      return res.status(403).json({ error: 'لا يمكنك منح هذه الصلاحية — تواصل مع المدير الرئيسي' });
    }
    const { name, role, dept, password, reset_password } = req.body;
    if (reset_password) {
      const tempPassword = generatePassword();
      const hashed = await bcrypt.hash(tempPassword, 10);
      const result = await pool.query(
        'UPDATE users SET name=$1, role=$2, dept=$3, password_hash=$4, must_change_password=TRUE WHERE id=$5 RETURNING id, username, name, role, dept',
        [name, role, dept, hashed, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      await logAudit(req.user.id, 'reset_password', 'users', req.params.id, null, null);
      return res.json({ success: true, user: result.rows[0], temp_password: tempPassword });
    }
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      const hashed = await bcrypt.hash(password, 10);
      const result = await pool.query(
        'UPDATE users SET name=$1, role=$2, dept=$3, password_hash=$4 WHERE id=$5 RETURNING id, username, name, role, dept',
        [name, role, dept, hashed, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, user: result.rows[0] });
    } else {
      const result = await pool.query(
        'UPDATE users SET name=$1, role=$2, dept=$3 WHERE id=$4 RETURNING id, username, name, role, dept',
        [name, role, dept, req.params.id]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
      res.json({ success: true, user: result.rows[0] });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Soft delete - deactivate instead of hard delete
    const old = await pool.query('SELECT username, name, role FROM users WHERE id = $1', [userId]);
    if (old.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (old.rows[0].role === 'super_admin') {
      return res.status(403).json({ error: 'لا يمكن تعطيل المدير الرئيسي' });
    }

    await pool.query('UPDATE users SET is_active = FALSE WHERE id = $1', [userId]);
    await logAudit(req.user.id, 'deactivate_user', 'users', userId, old.rows[0], { is_active: false });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id/reactivate', authMiddleware, superAdminOnly, async (req, res) => {
  try {
    const result = await pool.query('UPDATE users SET is_active = TRUE WHERE id = $1 RETURNING id, username, name, role, dept', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await logAudit(req.user.id, 'reactivate_user', 'users', parseInt(req.params.id), null, { is_active: true });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- FILES (protected) ---
app.get('/api/files/:filename', authMiddleware, (req, res) => {
  const safeName = path.basename(req.params.filename);
  const filePath = path.join(uploadDir, safeName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(path.resolve(filePath));
});

// --- EXPORT (admin only) ---
app.get('/api/export', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    const assessments = await pool.query('SELECT * FROM assessments');
    const domains = await pool.query('SELECT * FROM domains');
    const evidence = await pool.query('SELECT * FROM evidence');
    const phases = await pool.query('SELECT * FROM plan_phases');
    const tasks = await pool.query('SELECT * FROM plan_tasks');
    const overrides = await pool.query('SELECT * FROM plan_overrides');
    res.json({
      exported_at: new Date().toISOString(),
      assessments: assessments.rows,
      domains: domains.rows,
      evidence: evidence.rows,
      plan: { phases: phases.rows, tasks: tasks.rows, overrides: overrides.rows }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DEPT STATUS (admin only) ---
app.get('/api/dept-status', authMiddleware, adminOrSuper, async (req, res) => {
  try {
    const evidence = await pool.query('SELECT question_code, level, status, file_name FROM evidence WHERE has_doc = true');
    const domains = await pool.query('SELECT * FROM domains');
    res.json({ evidence: evidence.rows, domains: domains.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`NAII Backend running on port ${PORT}`);
});
