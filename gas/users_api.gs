const AUTHORIZED_CLIENT_ID = '164611973399-6s9mkjc5ign5eor8ko2nvg3mhvhapa58.apps.googleusercontent.com';
const USERS_SHEET_NAME = 'users';
const SESSIONS_SHEET_NAME = 'sessions';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const idToken = body.id_token;
    if (!idToken) return jsonOutput_({ ok: false, error: 'missing id_token' });

    const payload = verifyGoogleIdToken_(idToken);
    if (!payload) return jsonOutput_({ ok: false, error: 'invalid or expired token' });

    if (payload.aud !== AUTHORIZED_CLIENT_ID) {
      return jsonOutput_({ ok: false, error: 'token not issued for this app' });
    }
    if (payload.email_verified !== 'true') {
      return jsonOutput_({ ok: false, error: 'email not verified' });
    }

    const email = String(payload.email || '').toLowerCase().trim();
    const user = findUser_(email);
    if (!user) return jsonOutput_({ ok: false, error: 'email not registered' });
    if (!user.active) return jsonOutput_({ ok: false, error: 'account disabled' });

    const token = createSession_(user);

    return jsonOutput_({
      ok: true,
      token: token,
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

function createSession_(user) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) throw new Error('Missing sheet: ' + SESSIONS_SHEET_NAME);

  const now = Date.now();
  const values = sheet.getDataRange().getValues();
  const kept = [values[0]];

  for (let i = 1; i < values.length; i++) {
    const expiresAt = new Date(values[i][4]).getTime();
    if (expiresAt > now) kept.push(values[i]);
  }

  const token = Utilities.getUuid();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  kept.push([token, user.email, user.role, user.district, expiresAt]);

  sheet.clearContents();
  sheet.getRange(1, 1, kept.length, 5).setValues(kept);

  return token;
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}