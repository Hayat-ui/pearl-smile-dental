const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// ── Confirmation email to patient ─────────────────────────────────────────────
async function sendPatientConfirmation(appt) {
  if (!process.env.SMTP_USER) return; // skip if not configured

  const html = `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 560px; margin: auto; color: #2A2A2A;">
      <div style="background: #2A2A2A; padding: 28px 36px; border-radius: 16px 16px 0 0;">
        <h2 style="color: white; margin: 0; font-weight: 400; font-size: 22px;">
          🦷 PearlCare <span style="color: #C2D9CA;">Dental</span>
        </h2>
      </div>
      <div style="background: #FAF7F2; padding: 36px; border-radius: 0 0 16px 16px; border: 1px solid #eee;">
        <h3 style="color: #7A9E87; margin-top: 0;">Appointment Request Received ✓</h3>
        <p>Hi <strong>${appt.first_name}</strong>,</p>
        <p>Thank you for booking with PearlCare Dental. Here are your appointment details:</p>
        <table style="width:100%; border-collapse:collapse; margin: 20px 0;">
          <tr style="background:#fff; border-radius: 8px;">
            <td style="padding:10px 14px; font-weight:500; border-bottom:1px solid #eee; width:40%;">Service</td>
            <td style="padding:10px 14px; border-bottom:1px solid #eee;">${appt.service}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; font-weight:500; border-bottom:1px solid #eee;">Date</td>
            <td style="padding:10px 14px; border-bottom:1px solid #eee;">${appt.appt_date}</td>
          </tr>
          <tr style="background:#fff;">
            <td style="padding:10px 14px; font-weight:500; border-bottom:1px solid #eee;">Time</td>
            <td style="padding:10px 14px; border-bottom:1px solid #eee;">${appt.appt_time}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px; font-weight:500;">Status</td>
            <td style="padding:10px 14px; color:#7A9E87; font-weight:500;">Pending Confirmation</td>
          </tr>
        </table>
        <p style="font-size:13px; color:#888;">We'll confirm your appointment within 1 hour during clinic hours.<br>
        Questions? Call us: <strong>+92 300 123 4567</strong></p>
        <hr style="border:none; border-top:1px solid #eee; margin:24px 0;">
        <p style="font-size:12px; color:#aaa; margin:0;">12 Garden Town, Lahore · pearlcare.com.pk</p>
      </div>
    </div>`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: appt.email,
    subject: `Appointment Request Received — PearlCare Dental`,
    html,
  });
}

// ── Notification email to clinic ──────────────────────────────────────────────
async function sendClinicNotification(appt) {
  if (!process.env.CLINIC_EMAIL || !process.env.SMTP_USER) return;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto;">
      <h2 style="color:#5A7B66;">🔔 New Appointment Booking</h2>
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Name</td>
            <td style="padding:8px;">${appt.first_name} ${appt.last_name}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Phone</td>
            <td style="padding:8px;">${appt.phone}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Email</td>
            <td style="padding:8px;">${appt.email}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Service</td>
            <td style="padding:8px;">${appt.service}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Date</td>
            <td style="padding:8px;">${appt.appt_date}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Time</td>
            <td style="padding:8px;">${appt.appt_time}</td></tr>
        <tr><td style="padding:8px; font-weight:bold; background:#f5f5f5;">Notes</td>
            <td style="padding:8px;">${appt.notes || '—'}</td></tr>
      </table>
      <p style="font-size:12px; color:#aaa; margin-top:20px;">Booking ID: #${appt.id} · PearlCare Admin System</p>
    </div>`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: process.env.CLINIC_EMAIL,
    subject: `New Booking: ${appt.first_name} ${appt.last_name} — ${appt.appt_date} ${appt.appt_time}`,
    html,
  });
}

// ── Status update email to patient ────────────────────────────────────────────
async function sendStatusUpdate(appt) {
  if (!process.env.SMTP_USER) return;

  const statusColors = {
    confirmed: '#7A9E87',
    cancelled: '#C8606A',
    completed: '#6A88C8',
  };
  const color = statusColors[appt.status] || '#888';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto;">
      <h2 style="color:${color};">Appointment ${appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}</h2>
      <p>Hi <strong>${appt.first_name}</strong>, your appointment for <strong>${appt.service}</strong> 
         on <strong>${appt.appt_date} at ${appt.appt_time}</strong> has been 
         <strong style="color:${color};">${appt.status}</strong>.</p>
      ${appt.status === 'cancelled' ? '<p>Please call us to reschedule: <strong>+92 300 123 4567</strong></p>' : ''}
      ${appt.status === 'confirmed' ? '<p>Please arrive 5 minutes early. See you soon! 🦷</p>' : ''}
      <p style="font-size:12px; color:#aaa;">PearlCare Dental · 12 Garden Town, Lahore</p>
    </div>`;

  await getTransporter().sendMail({
    from: process.env.EMAIL_FROM,
    to: appt.email,
    subject: `Your appointment is ${appt.status} — PearlCare Dental`,
    html,
  });
}

module.exports = { sendPatientConfirmation, sendClinicNotification, sendStatusUpdate };
