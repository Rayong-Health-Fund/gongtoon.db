const P1_API_MASTER_SHEET = 'P1_Master_data';
const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const project = String(params.project || '').toLowerCase();
  const action = String(params.action || 'dashboard').toLowerCase();
  const session = validateSession_(params.token);

  if (project !== 'p1') {
    return jsonOutput_({ ok: false, error: 'รองรับเฉพาะ project=p1 ในไฟล์นี้' });
  }

  if (action === 'dashboard') {
    return jsonOutput_(getP1DashboardData_(session));
  }

  if (action === 'records') {
    if (!session) {
      return jsonOutput_({ ok: false, error: 'ต้องเข้าสู่ระบบก่อนดูข้อมูลรายบุคคล' });
    }
    return jsonOutput_({ ok: true, project: 'P1', records: getP1Records_() });
  }

  if (action === 'summary') {
    const records = getP1Records_();
    return jsonOutput_({ ok: true, project: 'P1', summary: buildP1Summary_(records) });
  }

  if (action === 'district_summary') {
    // Public — no session required. Only district-level aggregates
    // (count/budget/completion %) go out here, never names, addresses,
    // subdistrict, or disability type — those stay behind login since a
    // small subdistrict + a disability-type count can re-identify someone.
    const records = getP1Records_();
    return jsonOutput_({ ok: true, project: 'P1', districts: buildP1PublicDistrictSummary_(records) });
  }

  if (action === 'activity_log') {
    if (!session) {
      return jsonOutput_({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' });
    }
    const log = getP1ActivityLog_();
    const isPrivileged = session.role === 'admin' || session.role === 'executive';
    const activity = isPrivileged ? log : log.filter(function(item) { return item.by === session.email; });
    return jsonOutput_({ ok: true, project: 'P1', activity: activity });
  }

  return jsonOutput_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
}

function getP1ActivityLog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('P1_Update_Log');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues();
  const entries = values.map(function(row) {
    return {
      ts: row[0], type: 'new_case',
      text: 'เพิ่มข้อมูลปรับสภาพบ้าน: ' + row[2] + ' (อ.' + row[3] + ')',
      by: row[4]
    };
  });
  entries.sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); });
  return entries.slice(0, 30);
}

// Raw data has the provincial-capital district written a few different
// ways ("เมือง" from older rows, "เมืองระอง" — a typo missing ย — from at
// least one row, "เมืองระยอง" from the web form's own dropdown). All three
// are the same district and must merge into one, or every count/summary
// that groups by district silently splits into fragments.
function normalizeP1District_(d) {
  const s = String(d || '').trim();
  if (s === 'เมือง' || s === 'เมืองระอง' || s === 'เมืองระยอง') return 'เมืองระยอง';
  return s;
}

function buildP1PublicDistrictSummary_(records) {
  const byDistrict = {};
  records.forEach(function(r) {
    const d = String(r.district || '').trim();
    if (!d) return;
    if (!byDistrict[d]) byDistrict[d] = { district: d, count: 0, totalBudget: 0, done: 0 };
    const dd = byDistrict[d];
    dd.count++;
    dd.totalBudget += (Number(r.budget) || 0);
    if (r.projectStatus === 'แล้วเสร็จ') dd.done++;
  });

  return Object.keys(byDistrict).map(function(d) {
    const dd = byDistrict[d];
    return {
      district: dd.district,
      count: dd.count,
      totalBudget: dd.totalBudget,
      avgBudget: dd.count > 0 ? Math.round(dd.totalBudget / dd.count) : 0,
      donePct: dd.count > 0 ? Math.round((dd.done / dd.count) * 100) : 0
    };
  }).sort(function(a, b) { return b.count - a.count; });
}

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

    const required = ['name', 'age', 'status', 'house', 'tambon', 'amphoe', 'budget', 'budgetyear', 'projstatus'];
    for (let i = 0; i < required.length; i++) {
      const key = required[i];
      if (body[key] === undefined || body[key] === null || body[key] === '') {
        return jsonOutput_({ ok: false, error: 'ข้อมูลไม่ครบ: ' + key });
      }
    }

    const disabilities = Array.isArray(body.disabilities) ? body.disabilities : [];
    const disabilityCodes = disabilities
      .map(function(d) { const m = String(d).match(/ป\.(\d)/); return m ? 'ป.' + m[1] : null; })
      .filter(Boolean);
    const disabilityTypes = disabilities.filter(function(d) { return d !== 'ไม่พิการ'; });

    const now = new Date();
    const recordId = 'P1-WEB-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
    const statusText = String(body.status || '');

    const rowObj = {
      record_id: recordId,
      source_sheet: 'เว็บไซต์ (Web Form)',
      source_year_label: String(body.budgetyear || ''),
      agency: String(body.agency || ''),
      person_name: String(body.name || ''),
      age: Number(body.age) || 0,
      status_group: statusText,
      is_elderly: statusText.indexOf('ผู้สูงอายุ') > -1 ? 'TRUE' : 'FALSE',
      is_disabled: statusText.indexOf('ผู้พิการ') > -1 ? 'TRUE' : 'FALSE',
      disability_codes: disabilityCodes.join(','),
      disability_types: disabilityTypes.join(','),
      address_text: String(body.house || ''),
      subdistrict: String(body.tambon || ''),
      district: amphoe,
      province: 'ระยอง',
      budget: Number(body.budget) || 0,
      project_status: String(body.projstatus || ''),
      approved_date: String(body.approvedate || ''),
      mou_date: String(body.moudate || ''),
      note: 'กรอกผ่านเว็บโดย ' + session.email + ' เมื่อ ' + Utilities.formatDate(now, 'Asia/Bangkok', 'dd/MM/yyyy HH:mm')
    };

    appendP1Row_(rowObj);
    try { CacheService.getScriptCache().remove(P1_RECORDS_CACHE_KEY); } catch (e) {}

    logP1Submission_(SpreadsheetApp.getActiveSpreadsheet(), {
      recordId: recordId,
      name: rowObj.person_name,
      amphoe: amphoe,
      byEmail: session.email,
      photosBefore: String(body.photos_before || ''),
      photosAfter: String(body.photos_after || '')
    });

    return jsonOutput_({ ok: true, recordId: recordId });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// Appends a new row matching whatever column order P1_Master_data
// actually has (read from its own header row), so this never assumes
// a fixed layout and never touches any existing row.
function appendP1Row_(rowObj) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(P1_API_MASTER_SHEET);
  if (!sheet) throw new Error('ไม่พบชีท ' + P1_API_MASTER_SHEET);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  const newRow = headers.map(function(h) { return Object.prototype.hasOwnProperty.call(rowObj, h) ? rowObj[h] : ''; });
  sheet.appendRow(newRow);
}

// Photo URLs go in their own log sheet, never appended as new columns
// on P1_Master_data itself — this keeps the real production sheet's
// structure untouched, same as how P2/P3/P4 already log their own
// submission events separately from the raw data sheets.
function logP1Submission_(ss, info) {
  const sheet = ss.getSheetByName('P1_Update_Log') || ss.insertSheet('P1_Update_Log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'record_id', 'name', 'amphoe', 'submitted_by', 'photos_before', 'photos_after']);
  }
  sheet.appendRow([new Date(), info.recordId, info.name, info.amphoe, info.byEmail, info.photosBefore || '', info.photosAfter || '']);
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

function getP1DashboardData_(session) {
  const records = getP1Records_();

  const result = {
    ok: true,
    project: 'P1',
    projectName: 'โครงการปรับสภาพแวดล้อมที่อยู่อาศัยสำหรับคนพิการ ผู้สูงอายุ ผู้ป่วยที่อยู่ในระยะกึ่งเฉียบพลันและผู้ที่มีภาวะพึ่งพิง',
    updatedAt: new Date().toISOString(),
    summary: buildP1Summary_(records),
    filters: buildP1Filters_(records),
    charts: buildP1ChartAggregates_(records)
  };

  if (session) {
    result.records = records;
  }

  return result;
}

// getP1Records_ occasionally took long enough on the live spreadsheet
// to hit Apps Script's execution limit outright (same class of failure
// already fixed for P2/P3/P4) — visible as a silent blank section on
// the site since the fetch just failed with no records and no message.
// Cached for the same reason. The cache lives server-side only (never
// exposed to unauthenticated callers directly — doGet still gates
// `records` on a valid session same as before), so caching the raw
// personal-data records here is safe.
const P1_RECORDS_CACHE_KEY = 'p1_records_v1';
const P1_RECORDS_CACHE_TTL = 300; // seconds

function getP1Records_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(P1_RECORDS_CACHE_KEY);
  if (cached) return JSON.parse(cached);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(P1_API_MASTER_SHEET);

  if (!sheet) {
    throw new Error('ไม่พบชีท ' + P1_API_MASTER_SHEET);
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  const records = rows
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => { obj[header] = row[index] || ''; });

      return {
        recordId: obj.record_id,
        sourceSheet: obj.source_sheet,
        sourceYearLabel: obj.source_year_label,
        budgetYearStart: toNumber_(obj.budget_year_start),
        budgetYearEnd: toNumber_(obj.budget_year_end),
        agency: obj.agency,
        personName: obj.person_name,
        age: toNumber_(obj.age),
        statusGroup: obj.status_group,
        isElderly: toBoolean_(obj.is_elderly),
        isDisabled: toBoolean_(obj.is_disabled),
        disabilityCodes: splitText_(obj.disability_codes),
        disabilityTypes: splitText_(obj.disability_types),
        rawTypeText: obj.raw_type_text,
        addressText: obj.address_text,
        subdistrict: obj.subdistrict,
        district: normalizeP1District_(obj.district),
        province: obj.province,
        budget: toNumber_(obj.budget),
        projectStatus: obj.project_status,
        approvedDate: obj.approved_date,
        mouDate: obj.mou_date,
        note: obj.note
      };
    });

  try { cache.put(P1_RECORDS_CACHE_KEY, JSON.stringify(records), P1_RECORDS_CACHE_TTL); } catch (e) {}
  return records;
}

function buildP1Summary_(records) {
  const totalRecords = records.length;
  const completed = records.filter(r => r.projectStatus === 'แล้วเสร็จ').length;
  const inProgress = records.filter(r => r.projectStatus === 'กำลังดำเนินการ').length;
  const totalBudget = records.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);

  const districts = unique_(records.map(r => r.district).filter(Boolean));
  const agencies = unique_(records.map(r => r.agency).filter(Boolean));

  return {
    totalRecords: totalRecords,
    completed: completed,
    inProgress: inProgress,
    totalBudget: totalBudget,
    districtCount: districts.length,
    agencyCount: agencies.length,
    averageBudgetPerRecord: totalRecords ? Math.round(totalBudget / totalRecords) : 0
  };
}

function buildP1ChartAggregates_(records) {
  const byYear = {};
  const byDistrict = {};
  const byType = {};
  const byDisability = {};
  const byAge = [0, 0, 0, 0, 0];

  records.forEach(r => {
    const year = r.sourceYearLabel || r.budgetYearStart || '—';
    if (!byYear[year]) byYear[year] = { budget: 0, count: 0 };
    byYear[year].budget += Number(r.budget) || 0;
    byYear[year].count += 1;

    if (r.district) byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
    if (r.statusGroup) byType[r.statusGroup] = (byType[r.statusGroup] || 0) + 1;
    (r.disabilityTypes || []).forEach(d => { if (d) byDisability[d] = (byDisability[d] || 0) + 1; });

    const age = Number(r.age) || 0;
    if (age < 20) byAge[0]++;
    else if (age < 40) byAge[1]++;
    else if (age < 60) byAge[2]++;
    else if (age < 80) byAge[3]++;
    else byAge[4]++;
  });

  return { byYear: byYear, byDistrict: byDistrict, byType: byType, byDisability: byDisability, byAge: byAge };
}

function buildP1Filters_(records) {
  return {
    years: unique_(records.map(r => r.sourceYearLabel).filter(Boolean)),
    districts: unique_(records.map(r => r.district).filter(Boolean)),
    subdistricts: unique_(records.map(r => r.subdistrict).filter(Boolean)),
    agencies: unique_(records.map(r => r.agency).filter(Boolean)),
    statuses: unique_(records.map(r => r.projectStatus).filter(Boolean)),
    statusGroups: unique_(records.map(r => r.statusGroup).filter(Boolean)),
    disabilityCodes: unique_(records.flatMap(r => r.disabilityCodes || []))
  };
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function unique_(arr) {
  return [...new Set(arr.map(v => String(v).trim()).filter(Boolean))];
}

function splitText_(value) {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function toNumber_(value) {
  const cleaned = String(value || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function toBoolean_(value) {
  const text = String(value || '').toLowerCase().trim();
  return text === 'true' || text === 'yes' || text === '1' || text === 'ใช่';
}