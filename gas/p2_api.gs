const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';

// Form's district labels -> raw per-district sheet names.
// Every district matches by name except นิคมพัฒนา, whose raw sheet is
// historically named "อ.นิคม" (short form), not "อ.นิคมพัฒนา".
const P2_DISTRICT_SHEET_MAP = {
  'เมืองระยอง': 'อ.เมืองระยอง',
  'บ้านฉาง': 'อ.บ้านฉาง',
  'แกลง': 'อ.แกลง',
  'วังจันทร์': 'อ.วังจันทร์',
  'บ้านค่าย': 'อ.บ้านค่าย',
  'ปลวกแดง': 'อ.ปลวกแดง',
  'เขาชะเมา': 'อ.เขาชะเมา',
  'นิคมพัฒนา': 'อ.นิคม'
};

// Status dropdown values -> candidate header names for the matching
// quantity column on the raw district sheet (mirrors the candidates
// p2_migration.gs already searches for when building the master sheet).
const P2_STATUS_COLUMN_MAP = {
  'ใช้งานอยู่': ['ใช้งานอยู่ (ชิ้น)', 'ใช้งานอยู่'],
  'ชำรุด': ['ชำรุด (ชิ้น)', 'ชำรุด'],
  'คงเหลือ': ['คงเหลือ (ชิ้น)', 'คงเหลือ'],
  'ยืม': ['ยืม (ชิ้น)', 'อ้างยืม (ชิ้น)', 'อ้าง (ชิ้น)', 'ยืม']
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const session = validateSession_(body.token);
    if (!session) {
      return jsonOutput_({ ok: false, error: 'กรุณาเข้าสู่ระบบใหม่ (session หมดอายุหรือไม่ถูกต้อง)' });
    }

    const amphoe = String(body.amphoe || '').trim();
    if (session.role === 'staff' && session.district !== 'ทั้งหมด' && session.district !== amphoe) {
      return jsonOutput_({ ok: false, error: 'คุณกรอกข้อมูลได้เฉพาะเขต ' + session.district + ' เท่านั้น' });
    }

    const required = ['amphoe', 'agency', 'equipment', 'budgetyear', 'equipstatus'];
    for (let i = 0; i < required.length; i++) {
      const key = required[i];
      if (!body[key]) return jsonOutput_({ ok: false, error: 'ข้อมูลไม่ครบ: ' + key });
    }

    const sheetName = P2_DISTRICT_SHEET_MAP[amphoe];
    if (!sheetName) {
      return jsonOutput_({ ok: false, error: 'ไม่พบชีทดิบสำหรับอำเภอ: ' + amphoe });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      return jsonOutput_({ ok: false, error: 'ไม่พบชีทดิบ: ' + sheetName });
    }

    const agency = String(body.agency || '').trim();
    const equipment = String(body.equipment || '').trim();
    const status = String(body.equipstatus || '').trim();

    const statusCandidates = P2_STATUS_COLUMN_MAP[status];
    if (!statusCandidates) {
      return jsonOutput_({ ok: false, error: 'สถานะไม่รู้จัก: ' + status });
    }

    const values = sheet.getDataRange().getValues();
    const headerMap = getHeaderMap_(values[0]);

    const agencyCol = findColumnIndex_(headerMap, ['หน่วยงาน', 'ชื่อหน่วยงาน', 'ชื่อ_หน่วยงาน']);
    const equipCol = findColumnIndex_(headerMap, ['รายการ (ชิ้น)', 'รายการ', 'รายการอุปกรณ์', 'รายการ_อุปกรณ์']);
    const statusCol = findColumnIndex_(headerMap, statusCandidates);

    if (agencyCol === -1 || equipCol === -1 || statusCol === -1) {
      return jsonOutput_({ ok: false, error: 'โครงสร้างชีตดิบไม่ตรงกับที่ระบบคาดไว้ (หาคอลัมน์ไม่เจอ)' });
    }

    let targetRow = -1;
    for (let i = 1; i < values.length; i++) {
      const rowAgency = String(values[i][agencyCol] || '').trim();
      const rowEquip = String(values[i][equipCol] || '').trim();
      if (rowAgency === agency && rowEquip === equipment) {
        targetRow = i + 1; // 1-indexed sheet row
        break;
      }
    }

    if (targetRow === -1) {
      return jsonOutput_({
        ok: false,
        error: 'ไม่พบข้อมูลอุปกรณ์นี้ของหน่วยงานนี้ในระบบ กรุณาตรวจสอบชื่อหน่วยงาน/รายการอุปกรณ์ให้ตรงกับที่กองทุนฯบันทึกไว้เดิม'
      });
    }

    const cell = sheet.getRange(targetRow, statusCol + 1);
    const currentValue = toNumber_(cell.getValue());
    cell.setValue(currentValue + 1);

    logP2StatusUpdate_(ss, {
      sheetName: sheetName,
      row: targetRow,
      agency: agency,
      equipment: equipment,
      status: status,
      budgetyear: body.budgetyear,
      byEmail: session.email,
      photosBefore: String(body.photos_before || ''),
      photosAfter: String(body.photos_after || '')
    });

    return jsonOutput_({ ok: true, sheet: sheetName, row: targetRow, updatedStatus: status, newValue: currentValue + 1 });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function findColumnIndex_(headerMap, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const key = normalizeHeader_(candidates[i]);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return -1;
}

function logP2StatusUpdate_(ss, info) {
  const sheet = ss.getSheetByName('P2_Update_Log') || ss.insertSheet('P2_Update_Log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'sheet', 'row', 'agency', 'equipment', 'status', 'budgetyear', 'updated_by', 'photos_before', 'photos_after']);
  } else {
    // Migration-safe: append these two columns to an existing log sheet
    // without touching any existing row, same pattern used everywhere
    // else in this project when new fields are added later.
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    ['photos_before', 'photos_after'].forEach(function(h) {
      if (headers.indexOf(h) === -1) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  sheet.appendRow([new Date(), info.sheetName, info.row, info.agency, info.equipment, info.status, info.budgetyear, info.byEmail, info.photosBefore || '', info.photosAfter || '']);
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

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const type = (e.parameter.type || e.parameter.sheet || '').toLowerCase();

  if (type === 'agency_directory') {
    return jsonOutput_(getP2AgencyDirectory_(ss));
  }

  if (type === 'activity_log') {
    const session = validateSession_(e.parameter.token);
    if (!session) {
      return jsonOutput_({ error: true, message: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    const log = getP2ActivityLog_(ss);
    const isPrivileged = session.role === 'admin' || session.role === 'executive';
    const data = isPrivileged ? log : log.filter(function(item) { return item.by === session.email; });
    return jsonOutput_({ error: false, type: 'activity_log', data: data });
  }

  const routes = {
    equipment: 'P2_MASTER_EQUIPMENT_LOAN',
    funding: 'P2_MASTER_FUNDING',
    map: 'P2_MASTER_MAP_DESTINATION',
    ref_equipment: 'P2_REF_EQUIPMENT'
  };

  const sheetName = routes[type];

  if (!sheetName) {
    return jsonOutput_({
      error: true,
      message: 'กรุณาระบุ type ให้ถูกต้อง: equipment, funding, map, ref_equipment, agency_directory',
      available_types: Object.keys(routes).concat(['agency_directory'])
    });
  }

  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return jsonOutput_({
      error: true,
      message: 'ไม่พบชีท: ' + sheetName
    });
  }

  const data = sheetToJson_(sheet);

  return jsonOutput_({
    error: false,
    type: type,
    sheet: sheetName,
    count: data.length,
    updated_at: new Date(),
    data: data
  });
}

// Lightweight district -> agency list, purpose-built for populating the
// entry-form's agency dropdown quickly. Cached because P2_MASTER_EQUIPMENT_LOAN
// has 500+ rows and reading/serializing the full sheet takes several
// seconds — too slow for a form dropdown to wait on every page load.
const P2_AGENCY_CACHE_KEY = 'p2_agency_directory_v1';
const P2_AGENCY_CACHE_TTL = 300; // seconds

function getP2AgencyDirectory_(ss) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(P2_AGENCY_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const sheet = ss.getSheetByName('P2_MASTER_EQUIPMENT_LOAN');
  if (!sheet) return { error: true, message: 'ไม่พบชีท: P2_MASTER_EQUIPMENT_LOAN' };

  const data = sheetToJson_(sheet);
  const seen = {};
  const rows = [];
  data.forEach(function(r) {
    const d = String(r.district || '').trim();
    const a = String(r.agency || '').trim();
    if (!d || !a) return;
    const key = d + '||' + a;
    if (seen[key]) return;
    seen[key] = true;
    rows.push({ district: d, agency: a });
  });

  const result = { error: false, type: 'agency_directory', count: rows.length, data: rows };
  try {
    cache.put(P2_AGENCY_CACHE_KEY, JSON.stringify(result), P2_AGENCY_CACHE_TTL);
  } catch (e) {
    // Payload too large for CacheService (100KB/key limit) — skip caching.
  }
  return result;
}

function getP2ActivityLog_(ss) {
  const sheet = ss.getSheetByName('P2_Update_Log');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const entries = values.map(function(row) {
    return {
      ts: row[0], type: 'status_update',
      text: row[3] + ' — ' + row[4] + ': ' + row[5] + ' +1 (' + row[1] + ')',
      by: row[7]
    };
  });
  entries.sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); });
  return entries.slice(0, 30);
}

function sheetToJson_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const isEmpty = row.every(cell => cell === '' || cell === null);
    if (isEmpty) continue;

    const obj = {};

    headers.forEach((header, index) => {
      if (!header) return;

      const value = row[index];

      if (value instanceof Date) {
        obj[header] = Utilities.formatDate(
          value,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd'T'HH:mm:ss"
        );
      } else {
        obj[header] = value;
      }
    });

    rows.push(obj);
  }

  return rows;
}

function getHeaderMap_(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader_(h);
    if (key) map[key] = i;
  });
  return map;
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\n/g, '')
    .replace(/_/g, '')
    .toLowerCase();
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
