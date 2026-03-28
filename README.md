# 🦷 PearlCare Dental — Backend

Full-featured appointment booking backend with admin dashboard, email notifications, and Google Sheets sync.

## Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **Email**: Nodemailer (Gmail / any SMTP)
- **Sheets Sync**: Google Sheets API v4
- **Rate Limiting**: express-rate-limit

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
cd dental-backend
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` with your actual values (see configuration section below).

### 3. Start the server
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

Server runs on **http://localhost:3001**
- API:             `http://localhost:3001/api`
- Admin Dashboard: `http://localhost:3001/admin`
- Health Check:    `http://localhost:3001/api/health`

### 4. Default admin login
```
Email:    admin@pearlcare.com   (from ADMIN_EMAIL in .env)
Password: Admin@1234            (from ADMIN_PASSWORD in .env)
```
**Change this immediately after first login via the Settings page.**

---

## ⚙️ Configuration

### Email (Gmail)
1. Enable 2-Step Verification on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an App Password for "Mail"
4. Set in `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_gmail@gmail.com
SMTP_PASS=your_16_char_app_password
EMAIL_FROM="PearlCare Dental <your_gmail@gmail.com>"
CLINIC_EMAIL=clinic@yourdomain.com
```

### Google Sheets Sync
1. Go to https://console.cloud.google.com
2. Create a new project → Enable **Google Sheets API**
3. Create a **Service Account** → Generate a JSON key
4. Open the JSON key file and copy:
   - `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key`  → `GOOGLE_PRIVATE_KEY`
5. Create a Google Sheet and copy its ID from the URL:
   `https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit`
6. Share the sheet with the service account email (Editor access)
7. Set in `.env`:
```
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_SHEET_ID=your_sheet_id_here
```

---

## 🔌 Connecting the Frontend

In `dental_website.html`, update the booking form's submit handler to call this API:

```javascript
async function handleBooking() {
  // ... validation ...

  const payload = {
    first_name: document.getElementById('firstName').value.trim(),
    last_name:  document.getElementById('lastName').value.trim(),
    phone:      document.getElementById('phone').value.trim(),
    email:      document.getElementById('email').value.trim(),
    appt_date:  document.getElementById('apptDate').value,
    appt_time:  document.getElementById('apptTime').value,
    service:    document.getElementById('service').value,
    notes:      document.getElementById('notes').value.trim(),
  };

  const res = await fetch('http://localhost:3001/api/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (res.ok) {
    // Show success message
  } else {
    // Show errors: data.errors or data.error
  }
}
```

---

## 📡 API Reference

### Public Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/appointments` | Create new booking |
| GET | `/api/health` | Health check |

### Admin Endpoints (require `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Admin login |
| GET | `/api/auth/me` | Get current admin |
| POST | `/api/auth/change-password` | Change password |
| GET | `/api/appointments` | List appointments (filterable) |
| GET | `/api/appointments/stats` | Dashboard stats |
| GET | `/api/appointments/export/csv` | Export to CSV |
| GET | `/api/appointments/:id` | Get single appointment |
| PATCH | `/api/appointments/:id/status` | Update status |
| DELETE | `/api/appointments/:id` | Delete appointment |

### Query Params for GET /api/appointments
- `search` — name / email / phone search
- `status` — pending | confirmed | cancelled | completed
- `date` — YYYY-MM-DD
- `service` — service name filter
- `page`, `limit` — pagination
- `sort`, `order` — sort field and direction

---

## 📁 Project Structure
```
dental-backend/
├── server.js              # Entry point
├── .env.example           # Environment template
├── package.json
├── pearlcare.db           # SQLite DB (auto-created)
├── db/
│   └── database.js        # DB init + schema
├── middleware/
│   └── auth.js            # JWT middleware
├── routes/
│   ├── auth.js            # Auth routes
│   └── appointments.js    # Booking + admin routes
├── services/
│   ├── emailService.js    # Nodemailer email service
│   └── sheetsService.js   # Google Sheets sync
└── public/
    └── admin/
        └── index.html     # Admin dashboard SPA
```

---

## 🛡️ Security Features
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens with configurable expiry
- Rate limiting on all endpoints (stricter on booking)
- Input validation on all fields
- Duplicate booking detection
- Audit log for all admin actions
- Past date prevention on bookings
