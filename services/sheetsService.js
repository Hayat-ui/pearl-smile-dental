const { google } = require('googleapis');

let sheetsClient = null;

function getSheetsClient() {
  if (sheetsClient) return sheetsClient;

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    return null;
  }

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_NAME = 'Appointments';

// Ensure header row exists
async function ensureHeaders(sheets) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A1:K1`,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `${SHEET_NAME}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[
            'ID', 'First Name', 'Last Name', 'Phone', 'Email',
            'Date', 'Time', 'Service', 'Notes', 'Status', 'Booked At'
          ]],
        },
      });
    }
  } catch (err) {
    console.warn('⚠️  Could not ensure sheet headers:', err.message);
  }
}

// Append a new appointment row
async function appendAppointmentToSheet(appt) {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) {
    console.warn('⚠️  Google Sheets not configured — skipping sync.');
    return false;
  }

  try {
    await ensureHeaders(sheets);

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:K`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[
          appt.id,
          appt.first_name,
          appt.last_name,
          appt.phone,
          appt.email,
          appt.appt_date,
          appt.appt_time,
          appt.service,
          appt.notes || '',
          appt.status,
          appt.created_at,
        ]],
      },
    });

    console.log(`✅  Appointment #${appt.id} synced to Google Sheets.`);
    return true;
  } catch (err) {
    console.error('❌  Google Sheets sync failed:', err.message);
    return false;
  }
}

// Update status column when admin changes it
async function updateStatusInSheet(appt) {
  const sheets = getSheetsClient();
  if (!sheets || !SHEET_ID) return;

  try {
    // Find the row with matching ID
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!A:A`,
    });

    const rows = res.data.values || [];
    const rowIndex = rows.findIndex(r => String(r[0]) === String(appt.id));
    if (rowIndex === -1) return;

    const sheetRow = rowIndex + 1; // 1-indexed
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SHEET_NAME}!J${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[appt.status]] },
    });

    console.log(`✅  Status updated in Sheets for appointment #${appt.id}`);
  } catch (err) {
    console.error('❌  Sheets status update failed:', err.message);
  }
}

module.exports = { appendAppointmentToSheet, updateStatusInSheet };
