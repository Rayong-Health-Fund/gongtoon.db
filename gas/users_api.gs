// ============================================================
// Users / login API — bound directly to the Users spreadsheet
// (uses SpreadsheetApp.getActiveSpreadsheet(), not openById, since this
// script lives inside that spreadsheet itself). Handles:
//   - Google Sign-In verification + session creation (existing, live —
//     preserved exactly as-is; every staff login depends on it)
//   - Self-service registration requests + admin approval (new)
//
// Deploy as its own Web App (Execute as: Me, Access: Anyone).
// ============================================================

const AUTHORIZED_CLIENT_ID = '164611973399-6s9mkjc5ign5eor8ko2nvg3mhvhapa58.apps.googleusercontent.com';
const USERS_SHEET_NAME = 'users';
const SESSIONS_SHEET_NAME = 'sessions';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const REG_REQUESTS_SHEET_NAME = 'registration_requests';
const REG_REQUESTS_HEADERS = ['id', 'email', 'name', 'district', 'agency', 'status', 'requested_at', 'decided_at', 'decided_by', 'assigned_role'];

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || '').toLowerCase();

    if (action === 'list_requests') {
      const session = validateSession_(params.token);
      if (!session || session.role !== 'admin') {
        return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ (admin) เท่านั้นที่ดูคำขอสมัครได้' });
      }
      return jsonOutput_({ ok: true, requests: getAllRegistrationRequests_() });
    }

    return jsonOutput_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = String(body.action || '').toLowerCase();

    if (action === 'register') return handleRegister_(body);
    if (action === 'approve_request') return handleApproveRequest_(body);
    if (action === 'reject_request') return handleRejectRequest_(body);

    // Default (no action / legacy callers like login.html): existing
    // Google Sign-In → session flow, unchanged from before.
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

// ---- Self-service registration (new) ----
// Verifies the Google id_token the same way login does (so we know the
// requester really owns that email), then files a pending request for
// an admin to review — never writes into the real `users` sheet here.
function handleRegister_(body) {
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
  const name = String(body.name || payload.name || '').trim();
  const district = String(body.district || '').trim();
  const agency = String(body.agency || '').trim();

  if (!name || !district || !agency) {
    return jsonOutput_({ ok: false, error: 'กรุณากรอกชื่อ หน่วยงาน และอำเภอให้ครบ' });
  }

  if (findUser_(email)) {
    return jsonOutput_({ ok: false, error: 'อีเมลนี้ลงทะเบียนใช้งานอยู่แล้ว กรุณาเข้าสู่ระบบได้เลย' });
  }

  const sheet = ensureRegistrationSheetSetup_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const emailCol = headers.indexOf('email');
  const statusCol = headers.indexOf('status');
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][emailCol] || '').toLowerCase().trim() === email && values[i][statusCol] === 'pending') {
      return jsonOutput_({ ok: false, error: 'มีคำขอสมัครของอีเมลนี้รออนุมัติอยู่แล้ว กรุณารอกองทุนฯ ตรวจสอบ' });
    }
  }

  const now = new Date();
  const id = 'req-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  const rowObj = {
    id: id, email: email, name: name, district: district, agency: agency,
    status: 'pending', requested_at: now, decided_at: '', decided_by: '', assigned_role: ''
  };
  const newRow = headers.map(function(h) { return Object.prototype.hasOwnProperty.call(rowObj, h) ? rowObj[h] : ''; });
  sheet.appendRow(newRow);

  return jsonOutput_({ ok: true, id: id, message: 'ส่งคำขอสมัครแล้ว รอกองทุนฯ อนุมัติ' });
}

function handleApproveRequest_(body) {
  const session = validateSession_(body.token);
  if (!session || session.role !== 'admin') {
    return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ (admin) เท่านั้นที่อนุมัติคำขอได้' });
  }

  const id = String(body.id || '').trim();
  const role = String(body.role || '').trim();
  if (!id || !role) return jsonOutput_({ ok: false, error: 'ข้อมูลไม่ครบ: id และ role' });

  const reqSheet = ensureRegistrationSheetSetup_();
  const values = reqSheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');
  const emailCol = headers.indexOf('email');
  const nameCol = headers.indexOf('name');
  const districtCol = headers.indexOf('district');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === id) {
      if (values[i][statusCol] !== 'pending') {
        return jsonOutput_({ ok: false, error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });
      }
      const email = values[i][emailCol];
      const name = values[i][nameCol];
      const district = String(body.district || values[i][districtCol] || '').trim();

      if (findUser_(String(email).toLowerCase().trim())) {
        return jsonOutput_({ ok: false, error: 'อีเมลนี้มีบัญชีอยู่แล้ว' });
      }

      const usersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(USERS_SHEET_NAME);
      if (!usersSheet) return jsonOutput_({ ok: false, error: 'ไม่พบชีท ' + USERS_SHEET_NAME });
      const uHeaders = usersSheet.getRange(1, 1, 1, usersSheet.getLastColumn()).getValues()[0]
        .map(function(h) { return String(h).trim(); });
      const uRowObj = { email: email, name: name, district: district, role: role, active: 'TRUE' };
      const uNewRow = uHeaders.map(function(h) { return Object.prototype.hasOwnProperty.call(uRowObj, h) ? uRowObj[h] : ''; });
      usersSheet.appendRow(uNewRow);

      const row = i + 1;
      reqSheet.getRange(row, statusCol + 1).setValue('approved');
      reqSheet.getRange(row, headers.indexOf('decided_at') + 1).setValue(new Date());
      reqSheet.getRange(row, headers.indexOf('decided_by') + 1).setValue(session.email);
      reqSheet.getRange(row, headers.indexOf('assigned_role') + 1).setValue(role);

      return jsonOutput_({ ok: true, id: id });
    }
  }
  return jsonOutput_({ ok: false, error: 'ไม่พบคำขอนี้' });
}

function handleRejectRequest_(body) {
  const session = validateSession_(body.token);
  if (!session || session.role !== 'admin') {
    return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ (admin) เท่านั้นที่ปฏิเสธคำขอได้' });
  }

  const id = String(body.id || '').trim();
  if (!id) return jsonOutput_({ ok: false, error: 'ไม่พบ id ของคำขอ' });

  const sheet = ensureRegistrationSheetSetup_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === id) {
      if (values[i][statusCol] !== 'pending') {
        return jsonOutput_({ ok: false, error: 'คำขอนี้ถูกดำเนินการไปแล้ว' });
      }
      const row = i + 1;
      sheet.getRange(row, statusCol + 1).setValue('rejected');
      sheet.getRange(row, headers.indexOf('decided_at') + 1).setValue(new Date());
      sheet.getRange(row, headers.indexOf('decided_by') + 1).setValue(session.email);
      return jsonOutput_({ ok: true, id: id });
    }
  }
  return jsonOutput_({ ok: false, error: 'ไม่พบคำขอนี้' });
}

function ensureRegistrationSheetSetup_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REG_REQUESTS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(REG_REQUESTS_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(REG_REQUESTS_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    const missing = REG_REQUESTS_HEADERS.filter(function(h) { return existing.indexOf(h) === -1; });
    missing.forEach(function(h) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  return sheet;
}

function getAllRegistrationRequests_() {
  const sheet = ensureRegistrationSheetSetup_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const colIndex = {};
  headers.forEach(function(h, i) { colIndex[h] = i; });

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    items.push({
      id: row[colIndex['id']],
      email: row[colIndex['email']],
      name: row[colIndex['name']],
      district: row[colIndex['district']],
      agency: row[colIndex['agency']],
      status: row[colIndex['status']],
      requested_at: row[colIndex['requested_at']],
      decided_at: row[colIndex['decided_at']],
      decided_by: row[colIndex['decided_by']],
      assigned_role: row[colIndex['assigned_role']]
    });
  }
  items.sort(function(a, b) { return new Date(b.requested_at) - new Date(a.requested_at); });
  return items;
}

// Session validation for the new admin-only actions — same pattern used
// by every other API in this project, adapted to read the bound
// spreadsheet directly (getActiveSpreadsheet) like the rest of this file.
function validateSession_(token) {
  if (!token) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SESSIONS_SHEET_NAME);
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  const now = Date.now();
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[0] === token) {
      const expiresAt = new Date(row[4]).getTime();
      if (expiresAt > now) {
        return { email: row[1], role: row[2], district: row[3] };
      }
      return null;
    }
  }
  return null;
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
