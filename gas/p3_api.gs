const P3_SHEETS = [
  { tab: 'โครงการ ปี 65', year: 2565 },
  { tab: 'โครงการ ปี 66', year: 2566 },
  { tab: 'โครงการ ปี 67', year: 2567 },
  { tab: 'โครงการ ปี 68', year: 2568 },
  { tab: 'โครงการ ปี 69', year: 2569 }
];

const P3_STATUS_LABELS = {
  completed: 'เสร็จเรียบร้อย',
  in_progress: 'อยู่ระหว่างดำเนินการ'
};

const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || 'records').toLowerCase();

    if (action === 'activity_log') {
      const session = validateSession_(params.token);
      if (!session || (session.role !== 'admin' && session.role !== 'executive')) {
        return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ/ผู้บริหารเท่านั้นที่ดูประวัติการเปลี่ยนแปลงได้' });
      }
      return jsonOutput_({ ok: true, project: 'P3', activity: getP3ActivityLog_() });
    }

    const records = getP3Records_();
    return jsonOutput_({ ok: true, project: 'P3', records: records });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function getP3ActivityLog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const entries = [];

  const submitLog = ss.getSheetByName('P3_Update_Log');
  if (submitLog && submitLog.getLastRow() > 1) {
    const values = submitLog.getRange(2, 1, submitLog.getLastRow() - 1, 7).getValues();
    values.forEach(function(row) {
      entries.push({
        ts: row[0], type: 'new_project',
        text: 'เพิ่มโครงการใหม่: ' + row[5] + ' (' + row[2] + ')',
        by: row[6]
      });
    });
  }

  const statusLog = ss.getSheetByName('P3_Status_Log');
  if (statusLog && statusLog.getLastRow() > 1) {
    const values = statusLog.getRange(2, 1, statusLog.getLastRow() - 1, 5).getValues();
    values.forEach(function(row) {
      entries.push({
        ts: row[0], type: 'status_update',
        text: 'อัปเดตสถานะ (' + row[1] + ' แถว ' + row[2] + ') เป็น "' + row[3] + '"',
        by: row[4]
      });
    });
  }

  entries.sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); });
  return entries.slice(0, 30);
}

// The Fund (admin) is the only party allowed to decide/update a
// project's status — never the submitting agency (see doPost's main
// create-project branch below, which always writes "ยังไม่รายงานผล").
const P3_VALID_STATUSES = ['เสร็จเรียบร้อย', 'อยู่ระหว่างดำเนินการ', 'ยังไม่รายงานผล', 'ยกเลิก'];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const session = validateSession_(body.token);
    if (!session) {
      return jsonOutput_({ ok: false, error: 'กรุณาเข้าสู่ระบบใหม่ (session หมดอายุหรือไม่ถูกต้อง)' });
    }

    if (body.action === 'update_status') {
      return handleP3StatusUpdate_(session, body);
    }

    const amphoe = String(body.amphoe || '').trim();
    if (session.role === 'staff' && session.district !== 'ทั้งหมด' && session.district !== amphoe) {
      return jsonOutput_({ ok: false, error: 'คุณกรอกข้อมูลได้เฉพาะเขต ' + session.district + ' เท่านั้น' });
    }

    const required = ['budgetyear', 'amphoe', 'unit', 'amount', 'projname'];
    for (let i = 0; i < required.length; i++) {
      const key = required[i];
      if (body[key] === undefined || body[key] === null || body[key] === '') {
        return jsonOutput_({ ok: false, error: 'ข้อมูลไม่ครบ: ' + key });
      }
    }

    const sheetCfg = P3_SHEETS.filter(function(c) { return c.year === Number(body.budgetyear); })[0];
    if (!sheetCfg) {
      return jsonOutput_({
        ok: false,
        error: 'ไม่รองรับปีงบประมาณ: ' + body.budgetyear + ' (รองรับเฉพาะปี ' + P3_SHEETS.map(function(c){return c.year;}).join(', ') + ')'
      });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetCfg.tab);
    if (!sheet) {
      return jsonOutput_({ ok: false, error: 'ไม่พบชีท: ' + sheetCfg.tab });
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });

    const rowObj = {
      'อำเภอ': amphoe,
      'ชื่อหน่วยบริการ': String(body.unit || '').trim(),
      'จำนวนเงิน': Number(body.amount) || 0,
      'ชื่อโครงการ': String(body.projname || '').trim(),
      // Fund staff decide/update the real status later — never the submitter.
      'status': 'ยังไม่รายงานผล'
    };

    const newRow = headers.map(function(h) {
      return Object.prototype.hasOwnProperty.call(rowObj, h) ? rowObj[h] : '';
    });
    sheet.appendRow(newRow);

    logP3Submission_(ss, {
      tab: sheetCfg.tab,
      amphoe: amphoe,
      unit: rowObj['ชื่อหน่วยบริการ'],
      amount: rowObj['จำนวนเงิน'],
      projname: rowObj['ชื่อโครงการ'],
      byEmail: session.email,
      photosBefore: String(body.photos_before || ''),
      photosAfter: String(body.photos_after || '')
    });
    try { CacheService.getScriptCache().remove(P3_RECORDS_CACHE_KEY); } catch (e) {}

    return jsonOutput_({ ok: true, sheet: sheetCfg.tab });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function logP3Submission_(ss, info) {
  const sheet = ss.getSheetByName('P3_Update_Log') || ss.insertSheet('P3_Update_Log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'tab', 'amphoe', 'unit', 'amount', 'projname', 'submitted_by', 'photos_before', 'photos_after']);
  } else {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    ['photos_before', 'photos_after'].forEach(function(h) {
      if (headers.indexOf(h) === -1) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  sheet.appendRow([new Date(), info.tab, info.amphoe, info.unit, info.amount, info.projname, info.byEmail, info.photosBefore || '', info.photosAfter || '']);
}

function validateSession_(token) {
  if (!token) return null;

  const ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  const sheet = ss.getSheetByName('sessions');
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

function handleP3StatusUpdate_(session, body) {
  if (session.role !== 'admin') {
    return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ (admin) เท่านั้นที่แก้ไขสถานะโครงการได้' });
  }

  const tab = String(body.tab || '').trim();
  const row = Number(body.row);
  const status = String(body.status || '').trim();

  if (!tab || !row || !status) {
    return jsonOutput_({ ok: false, error: 'ข้อมูลไม่ครบสำหรับการแก้ไขสถานะ' });
  }
  if (P3_VALID_STATUSES.indexOf(status) === -1) {
    return jsonOutput_({ ok: false, error: 'สถานะไม่ถูกต้อง: ' + status });
  }

  const sheetCfg = P3_SHEETS.filter(function(c) { return c.tab === tab; })[0];
  if (!sheetCfg) {
    return jsonOutput_({ ok: false, error: 'ไม่พบชีท: ' + tab });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tab);
  if (!sheet) {
    return jsonOutput_({ ok: false, error: 'ไม่พบชีท: ' + tab });
  }
  if (row < 2 || row > sheet.getLastRow()) {
    return jsonOutput_({ ok: false, error: 'แถวไม่ถูกต้อง' });
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  const statusCol = headers.indexOf('status');
  if (statusCol === -1) {
    return jsonOutput_({ ok: false, error: 'ไม่พบคอลัมน์ status ในชีทนี้' });
  }

  sheet.getRange(row, statusCol + 1).setValue(status);

  logP3StatusUpdate_(ss, { tab: tab, row: row, status: status, byEmail: session.email });
  try { CacheService.getScriptCache().remove(P3_RECORDS_CACHE_KEY); } catch (e) {}

  return jsonOutput_({ ok: true, tab: tab, row: row, status: status });
}

function logP3StatusUpdate_(ss, info) {
  const sheet = ss.getSheetByName('P3_Status_Log') || ss.insertSheet('P3_Status_Log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'tab', 'row', 'new_status', 'updated_by']);
  }
  sheet.appendRow([new Date(), info.tab, info.row, info.status, info.byEmail]);
}

// getP3Records_ reads 5 full sheets on every call — measured 28-80+
// seconds against the live spreadsheet, occasionally timing out
// outright (404). Cached for the same reason P2/P4's dropdown data is:
// too slow for a page load to wait on. Busted on any write that
// changes the underlying rows (new project or status update).
const P3_RECORDS_CACHE_KEY = 'p3_records_v2';
const P3_RECORDS_CACHE_TTL = 300; // seconds

function getP3Records_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(P3_RECORDS_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const records = [];

  P3_SHEETS.forEach(function(cfg) {
    const sheet = ss.getSheetByName(cfg.tab);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headers = values[0].map(function(h) { return String(h).trim(); });
    const colIndex = {};
    headers.forEach(function(h, i) { colIndex[h] = i; });

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const district = row[colIndex['อำเภอ']];
      const agency   = row[colIndex['ชื่อหน่วยบริการ']];
      const amount   = row[colIndex['จำนวนเงิน']];
      const name     = row[colIndex['ชื่อโครงการ']];
      const statusRaw = String(row[colIndex['status']] || '').trim();

      if (!district && !agency && !name) continue;

      records.push({
        y: cfg.year,
        d: district,
        u: agency,
        b: Number(amount) || 0,
        n: name,
        s: P3_STATUS_LABELS[statusRaw] || statusRaw,
        tab: cfg.tab,
        row: i + 1 // 1-indexed sheet row — lets an admin-only status edit target this exact row
      });
    }
  });

  try { cache.put(P3_RECORDS_CACHE_KEY, JSON.stringify(records), P3_RECORDS_CACHE_TTL); } catch (e) {}
  rebuildP3MasterTab_(ss, records);
  return records;
}

// Human-readable single-tab view of all 5 years combined, kept in sync
// automatically: rebuilt every time getP3Records_ does a real recompute
// (cache-miss — at most every 5 min, or immediately after any write via
// the cache-bust above). Nothing needs to be run manually.
const P3_MASTER_SHEET = 'P3_สรุปทั้งหมด';

function rebuildP3MasterTab_(ss, records) {
  try {
    const sheet = ss.getSheetByName(P3_MASTER_SHEET) || ss.insertSheet(P3_MASTER_SHEET);
    const headers = ['ปีงบประมาณ', 'อำเภอ', 'ชื่อหน่วยบริการ', 'จำนวนเงิน', 'ชื่อโครงการ', 'สถานะ'];
    sheet.clearContents();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (records.length) {
      const rows = records.map(function(r) { return [r.y, r.d, r.u, r.b, r.n, r.s]; });
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
    sheet.setFrozenRows(1);
  } catch (e) {
    // Never let a summary-tab refresh failure break the actual API response.
  }
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
