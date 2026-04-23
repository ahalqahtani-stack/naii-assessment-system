require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

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
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.json({ success: false, error: 'اسم المستخدم غير موجود' });
    const user = result.rows[0];
    if (user.password_hash !== password) return res.json({ success: false, error: 'كلمة المرور غير صحيحة' });
    res.json({ success: true, token: 'naii_' + Date.now(), user: { id: user.id, name: user.name, role: user.role, dept: user.dept } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- ASSESSMENTS ---
app.get('/api/assessment', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM assessments ORDER BY question_code');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/assessment', async (req, res) => {
  try {
    const { assessments } = req.body;
    for (const a of assessments) {
      await pool.query(
        `INSERT INTO assessments (question_code, level, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (question_code) DO UPDATE SET level = $2, updated_at = NOW()`,
        [a.question_code, a.level]
      );
    }
    res.json({ success: true, count: assessments.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DOMAINS ---
app.get('/api/domains', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM domains ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/domains', async (req, res) => {
  try {
    const { domains } = req.body;
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

// --- PLAN ---
app.get('/api/plan', async (req, res) => {
  try {
    const phases = await pool.query('SELECT * FROM plan_phases ORDER BY phase_num');
    const tasks = await pool.query('SELECT * FROM plan_tasks ORDER BY id');
    const overrides = await pool.query('SELECT * FROM plan_overrides ORDER BY id');
    res.json({ phases: phases.rows, tasks: tasks.rows, overrides: overrides.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/plan', async (req, res) => {
  try {
    const { phases, tasks, overrides } = req.body;
    if (phases) {
      for (const p of phases) {
        await pool.query(
          `INSERT INTO plan_phases (phase_num, status, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (phase_num) DO UPDATE SET status = $2, updated_at = NOW()`,
          [p.phase_num, p.status]
        );
      }
    }
    if (tasks) {
      await pool.query('DELETE FROM plan_tasks');
      for (const t of tasks) {
        await pool.query(
          `INSERT INTO plan_tasks (domain_id, from_level, to_level, status, notes, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())`,
          [t.domain_id, t.from_level, t.to_level, t.status || 'pending', t.notes]
        );
      }
    }
    if (overrides) {
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

// --- FILE UPLOAD ---
app.post('/api/files/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    success: true,
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    path: req.file.path
  });
});

app.get('/api/files/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(path.resolve(filePath));
});

// --- EXPORT ---
app.get('/api/export', async (req, res) => {
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

// --- AUDIT LOG ---
app.get('/api/audit', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- EVIDENCE ---
app.get('/api/evidence', async (req, res) => {
  try {
    const { question_code, dept } = req.query;
    let query = 'SELECT * FROM evidence';
    const params = [];
    const conditions = [];
    if (question_code) { conditions.push('question_code = $' + (params.length + 1)); params.push(question_code); }
    if (dept) {
      conditions.push('question_code IN (SELECT question_code FROM evidence WHERE owner_dept = $' + (params.length + 1) + ')');
      params.push(dept);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY question_code, level';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/evidence/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const { question_code, level, user_id } = req.body;
    if (!question_code || level === undefined) return res.status(400).json({ error: 'question_code and level required' });

    const result = await pool.query(
      `INSERT INTO evidence (question_code, level, has_doc, file_path, file_name, file_size, status, uploaded_by, uploaded_at, updated_at)
       VALUES ($1, $2, true, $3, $4, $5, 'uploaded', $6, NOW(), NOW())
       ON CONFLICT (question_code, level) DO UPDATE SET
         has_doc = true, file_path = $3, file_name = $4, file_size = $5,
         status = 'uploaded', uploaded_by = $6, uploaded_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [question_code, parseInt(level), req.file.path, req.file.originalname, req.file.size, user_id || null]
    );

    // Create notification for admins
    const admins = await pool.query("SELECT id FROM users WHERE role = 'admin'");
    for (const admin of admins.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, entity_type, entity_id)
         VALUES ($1, $2, 'evidence_uploaded', 'evidence', $3)`,
        [admin.id, 'تم رفع ملف جديد لـ ' + question_code + ' المستوى ' + level, result.rows[0].id]
      );
    }

    res.json({ success: true, evidence: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/evidence/:id/approve', async (req, res) => {
  try {
    const { user_id } = req.body;
    const result = await pool.query(
      `UPDATE evidence SET status = 'approved', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [user_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    // Notify uploader
    const ev = result.rows[0];
    if (ev.uploaded_by) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, entity_type, entity_id)
         VALUES ($1, $2, 'evidence_approved', 'evidence', $3)`,
        [ev.uploaded_by, 'تم اعتماد الملف الخاص بـ ' + ev.question_code + ' المستوى ' + ev.level, ev.id]
      );
    }

    res.json({ success: true, evidence: ev });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/evidence/:id/reject', async (req, res) => {
  try {
    const { user_id, review_notes } = req.body;
    const result = await pool.query(
      `UPDATE evidence SET status = 'rejected', reviewed_by = $1, review_notes = $2, reviewed_at = NOW(), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [user_id || null, review_notes || '', req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const ev = result.rows[0];
    if (ev.uploaded_by) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, type, entity_type, entity_id)
         VALUES ($1, $2, 'evidence_rejected', 'evidence', $3)`,
        [ev.uploaded_by, 'تم رفض الملف الخاص بـ ' + ev.question_code + ' المستوى ' + ev.level + ' — السبب: ' + (review_notes || 'غير محدد'), ev.id]
      );
    }

    res.json({ success: true, evidence: ev });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- NOTIFICATIONS ---
app.get('/api/notifications', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.json([]);
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/notifications/unread-count', async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) return res.json({ count: 0 });
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND read = false',
      [user_id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/notifications/read-all', async (req, res) => {
  try {
    const { user_id } = req.body;
    if (!user_id) return res.json({ success: false });
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1', [user_id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- USERS MANAGEMENT ---
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, name, role, dept, created_at FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, name, role, dept } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const result = await pool.query(
      `INSERT INTO users (username, password_hash, name, role, dept)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, role, dept, created_at`,
      [username, password, name || '', role || 'department', dept || '']
    );
    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'اسم المستخدم موجود مسبقاً' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { name, role, dept, password } = req.body;
    let query, params;
    if (password) {
      query = 'UPDATE users SET name=$1, role=$2, dept=$3, password_hash=$4 WHERE id=$5 RETURNING id, username, name, role, dept';
      params = [name, role, dept, password, req.params.id];
    } else {
      query = 'UPDATE users SET name=$1, role=$2, dept=$3 WHERE id=$4 RETURNING id, username, name, role, dept';
      params = [name, role, dept, req.params.id];
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user: result.rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    if (parseInt(req.params.id) === 1) return res.status(400).json({ error: 'لا يمكن حذف المدير الرئيسي' });
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- DEPARTMENT STATUS ---
app.get('/api/dept-status', async (req, res) => {
  try {
    const evidence = await pool.query('SELECT question_code, level, status, file_name FROM evidence WHERE has_doc = true');
    const domains = await pool.query('SELECT * FROM domains');
    res.json({ evidence: evidence.rows, domains: domains.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`NAII Backend running on port ${PORT}`);
});
