const express = require('express');
const { db } = require('../db/database');
const auth = require('../middleware/auth');
const { sendPatientConfirmation, sendClinicNotification, sendStatusUpdate } = require('../services/emailService');
const { appendAppointmentToSheet, updateStatusInSheet } = require('../services/sheetsService');

const router = express.Router();

const VALID_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'];
const VALID_SERVICES = [
  'Dental Exam & Cleaning',
  'Teeth Whitening',
  'Dental Implants',
  'Orthodontics & Braces',
  'Root Canal Treatment',
  "Children's Dentistry",
  'Emergency / Pain Relief',
  'Other / Consultation',
];

function validateBooking(body) {
  const { first_name, last_name, phone, email, appt_date, appt_time, service } = body;
  const errors = [];

  if (!first_name || first_name.trim().length < 2) errors.push('First name is required.');
  if (!last_name  || last_name.trim().length  < 2) errors.push('Last name is required.');
  if (!phone      || !/^[\d\s\+\-\(\)]{7,20}$/.test(phone)) errors.push('Valid phone number is required.');
  if (!email      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Valid email is required.');
  if (!appt_date  || !/^\d{4}-\d{2}-\d{2}$/.test(appt_date)) errors.push('Valid date (YYYY-MM-DD) is required.');
  if (!appt_time) errors.push('Appointment time is required.');
  if (!service || !VALID_SERVICES.includes(service)) errors.push('Invalid service selected.');

  // Prevent past dates
  if (appt_date && new Date(appt_date) < new Date(new Date().toDateString())) {
    errors.push('Appointment date cannot be in the past.');
  }

  return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC: POST /api/appointments  — create booking
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const errors = validateBooking(req.body);
  if (errors.length) return res.status(400).json({ errors });

  const { first_name, last_name, phone, email, appt_date, appt_time, service, notes } = req.body;

  // Check for duplicate booking (same email + date + time)
  const dup = db.prepare(`
    SELECT id FROM appointments
    WHERE email = ? AND appt_date = ? AND appt_time = ? AND status != 'cancelled'
  `).get(email.trim().toLowerCase(), appt_date, appt_time);

  if (dup) {
    return res.status(409).json({ error: 'You already have a booking at this date and time.' });
  }

  const stmt = db.prepare(`
    INSERT INTO appointments (first_name, last_name, phone, email, appt_date, appt_time, service, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    first_name.trim(), last_name.trim(),
    phone.trim(), email.trim().toLowerCase(),
    appt_date, appt_time, service, notes?.trim() || null
  );

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(result.lastInsertRowid);

  // Fire-and-forget: email + sheets
  Promise.allSettled([
    sendPatientConfirmation(appt),
    sendClinicNotification(appt),
    appendAppointmentToSheet(appt).then(synced => {
      if (synced) {
        db.prepare('UPDATE appointments SET sheets_synced = 1 WHERE id = ?').run(appt.id);
      }
    }),
  ]).then(results => {
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`Post-booking task ${i} failed:`, r.reason?.message);
      }
    });
  });

  res.status(201).json({
    message: 'Appointment booked successfully.',
    appointment: {
      id: appt.id,
      first_name: appt.first_name,
      last_name: appt.last_name,
      service: appt.service,
      appt_date: appt.appt_date,
      appt_time: appt.appt_time,
      status: appt.status,
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /api/appointments  — list with filters & pagination
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', auth, (req, res) => {
  const {
    status, service, date, search,
    page = 1, limit = 20,
    sort = 'created_at', order = 'DESC'
  } = req.query;

  const allowedSorts  = ['created_at', 'appt_date', 'first_name', 'status'];
  const allowedOrders = ['ASC', 'DESC'];

  const sortCol  = allowedSorts.includes(sort)   ? sort  : 'created_at';
  const sortDir  = allowedOrders.includes(order.toUpperCase()) ? order.toUpperCase() : 'DESC';

  const conditions = [];
  const params = [];

  if (status)  { conditions.push('status = ?');        params.push(status); }
  if (service) { conditions.push('service = ?');        params.push(service); }
  if (date)    { conditions.push('appt_date = ?');      params.push(date); }
  if (search) {
    conditions.push(`(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)`);
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM appointments ${where}`).get(...params).cnt;
  const rows  = db.prepare(`
    SELECT * FROM appointments ${where}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({
    data: rows,
    pagination: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /api/appointments/stats  — dashboard summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/stats', auth, (req, res) => {
  const total     = db.prepare(`SELECT COUNT(*) as c FROM appointments`).get().c;
  const pending   = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE status='pending'`).get().c;
  const confirmed = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE status='confirmed'`).get().c;
  const cancelled = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE status='cancelled'`).get().c;
  const completed = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE status='completed'`).get().c;
  const today     = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE appt_date=date('now')`).get().c;
  const thisWeek  = db.prepare(`
    SELECT COUNT(*) as c FROM appointments
    WHERE appt_date >= date('now','weekday 0','-7 days') AND appt_date <= date('now','weekday 0')
  `).get().c;

  const byService = db.prepare(`
    SELECT service, COUNT(*) as count FROM appointments GROUP BY service ORDER BY count DESC
  `).all();

  const recent = db.prepare(`
    SELECT id, first_name, last_name, service, appt_date, appt_time, status, created_at
    FROM appointments ORDER BY created_at DESC LIMIT 5
  `).all();

  res.json({ total, pending, confirmed, cancelled, completed, today, thisWeek, byService, recent });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /api/appointments/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', auth, (req, res) => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });
  res.json(appt);
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PATCH /api/appointments/:id/status
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/status', auth, async (req, res) => {
  const { status } = req.body;
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  db.prepare(`UPDATE appointments SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, appt.id);

  db.prepare(`INSERT INTO audit_log (admin_id, action, target_id, detail) VALUES (?, 'status_change', ?, ?)`).run(
    req.admin.id, appt.id, `${appt.status} → ${status}`
  );

  const updated = db.prepare('SELECT * FROM appointments WHERE id = ?').get(appt.id);

  // Notify patient + update sheet
  Promise.allSettled([
    sendStatusUpdate(updated),
    updateStatusInSheet(updated),
  ]);

  res.json({ message: 'Status updated.', appointment: updated });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: DELETE /api/appointments/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', auth, (req, res) => {
  const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(req.params.id);
  if (!appt) return res.status(404).json({ error: 'Appointment not found.' });

  db.prepare('DELETE FROM appointments WHERE id = ?').run(appt.id);
  db.prepare(`INSERT INTO audit_log (admin_id, action, target_id, detail) VALUES (?, 'delete', ?, ?)`).run(
    req.admin.id, appt.id, `${appt.first_name} ${appt.last_name} — ${appt.appt_date}`
  );

  res.json({ message: 'Appointment deleted.' });
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /api/appointments/export/csv
// ─────────────────────────────────────────────────────────────────────────────
router.get('/export/csv', auth, (req, res) => {
  const { status, date } = req.query;
  const conditions = [];
  const params = [];

  if (status) { conditions.push('status = ?'); params.push(status); }
  if (date)   { conditions.push('appt_date = ?'); params.push(date); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM appointments ${where} ORDER BY appt_date ASC, appt_time ASC`).all(...params);

  const headers = ['ID','First Name','Last Name','Phone','Email','Date','Time','Service','Notes','Status','Booked At'];
  const csvRows = rows.map(r => [
    r.id, r.first_name, r.last_name, r.phone, r.email,
    r.appt_date, r.appt_time, r.service,
    (r.notes || '').replace(/,/g, ';'), r.status, r.created_at,
  ].map(v => `"${v}"`).join(','));

  const csv = [headers.join(','), ...csvRows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="appointments_${Date.now()}.csv"`);
  res.send(csv);
});

module.exports = router;
