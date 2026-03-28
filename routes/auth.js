const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const auth = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase().trim());
  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const valid = bcrypt.compareSync(password, admin.password);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  db.prepare(`INSERT INTO audit_log (admin_id, action, detail) VALUES (?, 'login', ?)`).run(
    admin.id, `Login from IP: ${req.ip}`
  );

  res.json({
    token,
    admin: { id: admin.id, name: admin.name, email: admin.email },
  });
});

// GET /api/auth/me  (protected)
router.get('/me', auth, (req, res) => {
  const admin = db.prepare('SELECT id, name, email, created_at FROM admins WHERE id = ?').get(req.admin.id);
  if (!admin) return res.status(404).json({ error: 'Admin not found.' });
  res.json(admin);
});

// POST /api/auth/change-password  (protected)
router.post('/change-password', auth, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both fields are required.' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  const valid = bcrypt.compareSync(currentPassword, admin.password);
  if (!valid) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE admins SET password = ? WHERE id = ?').run(hash, req.admin.id);

  db.prepare(`INSERT INTO audit_log (admin_id, action, detail) VALUES (?, 'change_password', 'Password changed')`).run(req.admin.id);

  res.json({ message: 'Password updated successfully.' });
});

module.exports = router;
