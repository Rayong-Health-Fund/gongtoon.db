// ============================================================
// Rayong Health Fund — membership / login verification API
// ============================================================
// Bound to the separate "กองทุนระยอง - ผู้ใช้งานและสิทธิ์" Sheet
// (spreadsheet id 1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY) —
// intentionally its own spreadsheet, not a tab in any of the 4
// project sheets, so this never touches production project data.
//
// Flow: frontend uses Google Identity Services ("Sign in with
// Google") to obtain an ID token, then POSTs { id_token } here.
// This script verifies the token with Google, looks up the email
// in the "users" sheet, and returns the caller's role + district.
//
// IMPORTANT: fill in AUTHORIZED_CLIENT_ID below once the OAuth
// Client ID is created in Google Cloud Console. Until it's set,
// this will reject every token (fails closed, not open).
// ============================================================

const AUTHORIZED_CLIENT_ID = '164611973399-6s9mkjc5ign5eor8ko2nvg3mhvhapa58.apps.googleusercontent.com';
const USERS_SHEET_NAME = 'users';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const idToken = body.id_token;
    if (!idToken) return jsonOutput_({ ok: false, error: 'missing id_token' });

    const payload = verifyGoogleIdToken_(idToken);
    if (!payload) return jsonOutput_({ ok: false, error: 'invalid or expired token' });

    if (AUTHORIZED_CLIENT_ID === 'REPLACE_WITH_OAUTH_CLIENT_ID' || payload.aud !== AUTHORIZED_CLIENT_ID) {
      return jsonOutput_({ ok: false, error: 'token not issued for this app' });
    }
    if (payload.email_verified !== 'true') {
      return jsonOutput_({ ok: false, error: 'email not verified' });
    }

    const email = String(payload.email || '').toLowerCase().trim();
    const user = findUser_(email);
    if (!user) return jsonOutput_({ ok: false, error: 'email not registered' });
    if (!user.active) return jsonOutput_({ ok: false, error: 'account disabled' });

    return jsonOutput_({
      ok: true,
      email: user.email,
      name: user.name,
      district: user.district,
      role: user.role
    });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function verifyGoogleIdToken_(idToken) {
  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return null;
  return JSON.parse(resp.getContentText());
}

function findUser_(email) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) throw new Error('Missing sheet: ' + USERS_SHEET_NAME);

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const obj = {};
    headers.forEach(function(h, idx) { obj[h] = row[idx]; });

    if (String(obj.email || '').toLowerCase().trim() === email) {
      return {
        email: obj.email,
        name: obj.name,
        district: obj.district,
        role: obj.role,
        active: obj.active === true || String(obj.active).toUpperCase() === 'TRUE'
      };
    }
  }
  return null;
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
