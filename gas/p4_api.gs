const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';

// Each entry maps a submitted year-phase to the candidate header names
// for its "buy" (จัดซื้อ) and "paid" (เบิกจ่าย) columns on a repair
// center's raw sheet. Deliberately excludes any "สุทธิ"/"คงเหลือ"
// (net/balance) column — those are calculated/protected on the real
// sheet and doPost must never write to them.
// ปี 68 is handled separately (see resolveP4_68_) because some centers'
// raw sheets split it into "ระยะ 1"/"ระยะ 2" columns and others keep a
// single combined "ปี 68" column — which one exists differs per center
// and must be detected from that sheet's actual headers, not assumed.
const P4_YEAR_FIELDS = [
  { buyField: 'buy66', paidField: 'paid66', buyKeys: ['จำนวนที่ซื้อ ปี 66', 'จำนวนที่ซื้อ ปี66', 'จัดซื้อ_ปี66'], paidKeys: ['จำนวนเบิกจ่าย ปี 66', 'จำนวนเบิกจ่าย ปี66', 'เบิกจ่าย_ปี66'] },
  { buyField: 'buy67', paidField: 'paid67', buyKeys: ['จำนวนที่ซื้อ ปี 67', 'จำนวนที่ซื้อ ปี67', 'จัดซื้อ_ปี67'], paidKeys: ['จำนวนเบิกจ่าย ปี 67', 'จำนวนเบิกจ่าย ปี67', 'เบิกจ่าย_ปี67'] },
  { buyField: 'buy69', paidField: 'paid69', buyKeys: ['จำนวนที่ซื้อ ปี 69', 'จำนวนที่ซื้อ ปี69', 'จัดซื้อ_ปี69'], paidKeys: ['จำนวนเบิกจ่าย ปี 69', 'จำนวนเบิกจ่าย ปี69', 'เบิกจ่าย_ปี69'] }
];

// Detects, from this sheet's own headers, whether ปี 68 is split into
// ระยะ 1/ระยะ 2 columns or kept as one combined column, and returns the
// list of { buyField, paidField, buyCol, paidCol } writes to perform.
function resolveP4_68Writes_(headerMap, body) {
  const buyR1Col = findCol4_(headerMap, ['จำนวนที่ซื้อ ปี 68 ระยะ 1', 'จำนวนที่ซื้อ ปี68 ระยะ1']);
  const buyR2Col = findCol4_(headerMap, ['จำนวนที่ซื้อ ปี 68 ระยะ 2', 'จำนวนที่ซื้อ ปี68 ระยะ2']);
  const paidR1Col = findCol4_(headerMap, ['จำนวนเบิกจ่าย ปี 68 ระยะ 1', 'จำนวนเบิกจ่าย ปี68 ระยะ1']);
  const paidR2Col = findCol4_(headerMap, ['จำนวนเบิกจ่าย ปี 68 ระยะ 2', 'จำนวนเบิกจ่าย ปี68 ระยะ2']);

  if (buyR1Col !== -1 || buyR2Col !== -1 || paidR1Col !== -1 || paidR2Col !== -1) {
    // This center's sheet does split ปี 68 into phases.
    return [
      { field: 'buy68r1', col: buyR1Col, val: toNumber4_(body.buy68r1) },
      { field: 'paid68r1', col: paidR1Col, val: toNumber4_(body.paid68r1) },
      { field: 'buy68r2', col: buyR2Col, val: toNumber4_(body.buy68r2) },
      { field: 'paid68r2', col: paidR2Col, val: toNumber4_(body.paid68r2) }
    ];
  }

  // No phase split on this sheet — combine both phases into the single
  // "ปี 68" column so nothing gets silently dropped or double-counted.
  const buyGenericCol = findCol4_(headerMap, ['จำนวนที่ซื้อ ปี 68', 'จำนวนที่ซื้อ ปี68', 'จัดซื้อ_ปี68']);
  const paidGenericCol = findCol4_(headerMap, ['จำนวนเบิกจ่าย ปี 68', 'จำนวนเบิกจ่าย ปี68', 'เบิกจ่าย_ปี68']);
  return [
    { field: 'buy68(รวมระยะ1+2)', col: buyGenericCol, val: toNumber4_(body.buy68r1) + toNumber4_(body.buy68r2) },
    { field: 'paid68(รวมระยะ1+2)', col: paidGenericCol, val: toNumber4_(body.paid68r1) + toNumber4_(body.paid68r2) }
  ];
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const session = validateSession_(body.token);
    if (!session) {
      return jsonOutput({ ok: false, error: 'กรุณาเข้าสู่ระบบใหม่ (session หมดอายุหรือไม่ถูกต้อง)' });
    }

    const amphoe = String(body.amphoe || '').trim();
    if (session.role === 'staff' && session.district !== 'ทั้งหมด' && session.district !== amphoe) {
      return jsonOutput({ ok: false, error: 'คุณกรอกข้อมูลได้เฉพาะเขต ' + session.district + ' เท่านั้น' });
    }

    const required = ['amphoe', 'agency', 'group', 'item', 'unit'];
    for (let i = 0; i < required.length; i++) {
      const key = required[i];
      if (!body[key]) return jsonOutput({ ok: false, error: 'ข้อมูลไม่ครบ: ' + key });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const center = findP4Center_(ss, amphoe, body.agency);
    if (!center) {
      return jsonOutput({
        ok: false,
        error: 'ไม่พบศูนย์ซ่อมชื่อ "' + body.agency + '" ในเขต ' + amphoe + ' กรุณาตรวจสอบชื่อหน่วยงานให้ตรงกับที่กองทุนฯบันทึกไว้'
      });
    }

    const sheet = ss.getSheetByName(center.tab_name);
    if (!sheet) {
      return jsonOutput({ ok: false, error: 'ไม่พบชีท: ' + center.tab_name });
    }

    const values = sheet.getDataRange().getValues();
    if (values.length < 1) {
      return jsonOutput({ ok: false, error: 'ชีท ' + center.tab_name + ' ไม่มีหัวตาราง' });
    }

    const headers = values[0].map(function(h) { return String(h).trim(); });
    const headerMap = {};
    headers.forEach(function(h, i) { if (h) headerMap[normalizeHeader4_(h)] = i; });

    const groupCol = findCol4_(headerMap, ['กลุ่ม', 'กลุ่ม_อุปกรณ์ที่พร้อมให้บริการ']);
    const itemCol = findCol4_(headerMap, ['รายการ', 'รายการ_อุปกรณ์', 'ชื่อรายการ']);
    const unitCol = findCol4_(headerMap, ['หน่วย', 'อุปกรณ์_หน่วย']);

    if (itemCol === -1) {
      return jsonOutput({ ok: false, error: 'โครงสร้างชีตไม่ตรงกับที่ระบบคาดไว้ (หาคอลัมน์รายการไม่เจอ)' });
    }

    const itemName = String(body.item || '').trim();
    const groupName = String(body.group || '').trim();

    let targetRow = -1;
    for (let i = 1; i < values.length; i++) {
      const rowItem = String(values[i][itemCol] || '').trim();
      const rowGroup = groupCol === -1 ? '' : String(values[i][groupCol] || '').trim();
      if (rowItem === itemName && (groupCol === -1 || rowGroup === groupName)) {
        targetRow = i + 1; // 1-indexed sheet row
        break;
      }
    }

    const appliedFields = [];
    const skippedFields = [];

    if (targetRow === -1) {
      // New item never registered at this center — append a fresh row.
      // Balance/net columns are intentionally left blank.
      const rowObj = {};
      rowObj[headers[groupCol]] = groupName;
      rowObj[headers[itemCol]] = itemName;
      if (unitCol !== -1) rowObj[headers[unitCol]] = String(body.unit || '').trim();

      P4_YEAR_FIELDS.forEach(function(yf) {
        const buyCol = findCol4_(headerMap, yf.buyKeys);
        const paidCol = findCol4_(headerMap, yf.paidKeys);
        const buyVal = toNumber4_(body[yf.buyField]);
        const paidVal = toNumber4_(body[yf.paidField]);
        if (buyCol !== -1 && buyVal) { rowObj[headers[buyCol]] = buyVal; appliedFields.push(yf.buyField); }
        if (paidCol !== -1 && paidVal) { rowObj[headers[paidCol]] = paidVal; appliedFields.push(yf.paidField); }
      });

      resolveP4_68Writes_(headerMap, body).forEach(function(w) {
        if (w.col !== -1 && w.val) { rowObj[headers[w.col]] = w.val; appliedFields.push(w.field); }
        else if (w.val) { skippedFields.push(w.field); }
      });

      const newRow = headers.map(function(h) {
        return Object.prototype.hasOwnProperty.call(rowObj, h) ? rowObj[h] : '';
      });
      sheet.appendRow(newRow);
      targetRow = sheet.getLastRow();
    } else {
      // Existing item — add the submitted amounts onto whatever is
      // already in the buy/paid cells. Never touch net/balance columns.
      P4_YEAR_FIELDS.forEach(function(yf) {
        const buyVal = toNumber4_(body[yf.buyField]);
        const paidVal = toNumber4_(body[yf.paidField]);

        if (buyVal) {
          const buyCol = findCol4_(headerMap, yf.buyKeys);
          if (buyCol !== -1) {
            const cell = sheet.getRange(targetRow, buyCol + 1);
            cell.setValue(toNumber4_(cell.getValue()) + buyVal);
            appliedFields.push(yf.buyField);
          } else {
            skippedFields.push(yf.buyField);
          }
        }
        if (paidVal) {
          const paidCol = findCol4_(headerMap, yf.paidKeys);
          if (paidCol !== -1) {
            const cell = sheet.getRange(targetRow, paidCol + 1);
            cell.setValue(toNumber4_(cell.getValue()) + paidVal);
            appliedFields.push(yf.paidField);
          } else {
            skippedFields.push(yf.paidField);
          }
        }
      });

      resolveP4_68Writes_(headerMap, body).forEach(function(w) {
        if (!w.val) return;
        if (w.col === -1) { skippedFields.push(w.field); return; }
        const cell = sheet.getRange(targetRow, w.col + 1);
        cell.setValue(toNumber4_(cell.getValue()) + w.val);
        appliedFields.push(w.field);
      });
    }

    logP4Update_(ss, {
      tab: center.tab_name,
      row: targetRow,
      agency: center.center_name,
      group: groupName,
      item: itemName,
      applied: appliedFields.join(','),
      skipped: skippedFields.join(','),
      byEmail: session.email,
      photosBefore: String(body.photos_before || ''),
      photosAfter: String(body.photos_after || '')
    });

    if (appliedFields.length === 0) {
      return jsonOutput({ ok: false, error: 'ไม่มีค่าที่กรอกมากพอจะบันทึก (ยอดซื้อ/เบิกจ่ายทุกปีเป็น 0)' });
    }

    // Note: this writes to the raw center sheet directly. The dropdown
    // data and dashboard both read from P4_MASTER_DEVICES instead (fast,
    // single-sheet reads), so if this submission added a genuinely new
    // item/center that wasn't there before, it won't appear until
    // someone runs "รีเฟรช Master ศูนย์ซ่อม" from the spreadsheet's menu.
    // Updates to already-existing items are visible immediately either
    // way since only the raw sheet's numbers change, not the directory.

    return jsonOutput({ ok: true, sheet: center.tab_name, row: targetRow, applied: appliedFields, skipped: skippedFields });
  } catch (err) {
    return jsonOutput({ ok: false, error: String(err) });
  }
}

function findP4Center_(ss, amphoe, agencyText) {
  const configSheet = ss.getSheetByName('config_centers');
  if (!configSheet) return null;

  const configs = sheetToObjects(configSheet).filter(function(row) {
    return String(row.active).toUpperCase() === 'TRUE' && String(row.type || '').trim() === 'repair_center';
  });

  const normAgency = normalizeHeader4_(agencyText);

  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    if (String(c.district || '').trim() !== amphoe) continue;
    const normCenterName = normalizeHeader4_(c.center_name);
    const normTabName = normalizeHeader4_(c.tab_name);
    if (normCenterName === normAgency || normTabName === normAgency) {
      return { center_name: c.center_name, tab_name: String(c.tab_name || '').trim(), district: c.district };
    }
  }
  // Fallback: substring match within the same district.
  for (let i = 0; i < configs.length; i++) {
    const c = configs[i];
    if (String(c.district || '').trim() !== amphoe) continue;
    const normCenterName = normalizeHeader4_(c.center_name);
    if (normCenterName.indexOf(normAgency) !== -1 || normAgency.indexOf(normCenterName) !== -1) {
      return { center_name: c.center_name, tab_name: String(c.tab_name || '').trim(), district: c.district };
    }
  }
  return null;
}

function getP4ActivityLog_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('P4_Update_Log');
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  const entries = values.map(function(row) {
    return {
      ts: row[0], type: 'purchase_update',
      text: row[3] + ' — ' + row[5] + ': ' + row[6],
      by: row[8]
    };
  });
  entries.sort(function(a, b) { return new Date(b.ts) - new Date(a.ts); });
  return entries.slice(0, 30);
}

function logP4Update_(ss, info) {
  const sheet = ss.getSheetByName('P4_Update_Log') || ss.insertSheet('P4_Update_Log');
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['timestamp', 'tab', 'row', 'agency', 'group', 'item', 'applied_fields', 'skipped_fields', 'updated_by', 'photos_before', 'photos_after']);
  } else {
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    ['photos_before', 'photos_after'].forEach(function(h) {
      if (headers.indexOf(h) === -1) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  sheet.appendRow([new Date(), info.tab, info.row, info.agency, info.group, info.item, info.applied, info.skipped, info.byEmail, info.photosBefore || '', info.photosAfter || '']);
}

function findCol4_(headerMap, candidates) {
  for (let i = 0; i < candidates.length; i++) {
    const key = normalizeHeader4_(candidates[i]);
    if (headerMap[key] !== undefined) return headerMap[key];
  }
  return -1;
}

function normalizeHeader4_(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/\n/g, '').replace(/_/g, '').toLowerCase();
}

function toNumber4_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
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
  const action = (e.parameter.action || "devices").toString();

  try {
    let result;

    if (action === "devices") {
      result = getDevicesData();
    } else if (action === "directory") {
      result = getP4Directory_();
    } else if (action === "activity_log") {
      const session = validateSession_(e.parameter.token);
      if (!session || (session.role !== 'admin' && session.role !== 'executive')) {
        result = { status: "error", message: 'เฉพาะกองทุนฯ/ผู้บริหารเท่านั้นที่ดูประวัติการเปลี่ยนแปลงได้' };
      } else {
        result = { status: "ok", action: "activity_log", data: getP4ActivityLog_() };
      }
    } else if (action === "user_groups") {
      result = getUserGroupsData();
    } else if (action === "funding") {
      result = getFundingData();
    } else if (action === "health") {
      result = {
        status: "ok",
        message: "P4 API is running",
        available_actions: ["devices", "directory", "user_groups", "funding", "health"]
      };
    } else {
      result = {
        status: "error",
        message: "Unknown action: " + action
      };
    }

    return jsonOutput(result);

  } catch (err) {
    return jsonOutput({
      status: "error",
      message: err.message,
      stack: err.stack
    });
  }
}

// ── P4_MASTER_DEVICES ────────────────────────────────────────────────────
// Both "devices" and "directory" used to live-scan all 10 repair-center
// sheets on every request (measured 6-40s, occasionally timing out
// outright at 39s+). That's fixed now by consolidating into one master
// tab that both routes read from — a single sheet read is fast
// regardless of request volume, and it also gives the Fund one page to
// look at directly instead of 10 tabs.
//
// The master is NOT rebuilt on every request (that would just move the
// slow 10-sheet scan from "read" to "write" time). Instead: run
// "รีเฟรช Master ศูนย์ซ่อม" from this spreadsheet's custom menu
// (P4 เครื่องมือ) whenever the raw center sheets have been updated —
// same manual-refresh pattern already used for P2's master sheets.
const P4_MASTER_SHEET = 'P4_MASTER_DEVICES';
const P4_MASTER_HEADERS = [
  'center_name', 'tab_name', 'district', 'category', 'item', 'unit',
  'buy66', 'paid66', 'balance66',
  'buy67', 'paid67', 'balance67',
  'buy68', 'balance68_before', 'paid68', 'balance68',
  'buy69', 'balance69_before', 'paid69', 'balance69'
];
const P4_MASTER_NUMERIC_COLS = [
  'buy66', 'paid66', 'balance66', 'buy67', 'paid67', 'balance67',
  'buy68', 'balance68_before', 'paid68', 'balance68',
  'buy69', 'balance69_before', 'paid69', 'balance69'
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('P4 เครื่องมือ')
    .addItem('รีเฟรช Master ศูนย์ซ่อม (ข้อมูลล่าสุด)', 'menuRebuildP4Master_')
    .addToUi();
}

// Menu-only entry point — SpreadsheetApp.getUi() only works when a human
// triggers it from the Sheets UI, never from a Web App request.
function menuRebuildP4Master_() {
  const count = rebuildP4MasterTab_();
  SpreadsheetApp.getUi().alert('รีเฟรช Master ศูนย์ซ่อมสำเร็จแล้ว: ' + count + ' รายการ');
}

function rebuildP4MasterTab_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = computeP4DevicesData_(ss);

  const sheet = ss.getSheetByName(P4_MASTER_SHEET) || ss.insertSheet(P4_MASTER_SHEET);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, P4_MASTER_HEADERS.length).setValues([P4_MASTER_HEADERS]);
  if (rows.length) {
    const data = rows.map(function(r) {
      return P4_MASTER_HEADERS.map(function(h) { return r[h] !== undefined ? r[h] : ''; });
    });
    sheet.getRange(2, 1, data.length, P4_MASTER_HEADERS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
  return rows.length;
}

function readP4MasterTab_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(function(h) { return String(h).trim(); });
  return values.slice(1).map(function(row) {
    const obj = {};
    headers.forEach(function(h, i) {
      obj[h] = P4_MASTER_NUMERIC_COLS.indexOf(h) !== -1 ? (Number(row[i]) || 0) : row[i];
    });
    return obj;
  });
}

// Lightweight directory (district + center_name + category + item only,
// no financial figures) purpose-built for populating the entry-form
// dropdowns quickly.
function getP4Directory_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(P4_MASTER_SHEET);
  if (!sheet) { rebuildP4MasterTab_(); sheet = ss.getSheetByName(P4_MASTER_SHEET); }

  const rows = readP4MasterTab_(sheet).map(function(r) {
    return { district: r.district, center_name: r.center_name, category: r.category, item: r.item };
  });
  return { status: "ok", action: "directory", count: rows.length, data: rows };
}

function getDevicesData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(P4_MASTER_SHEET);
  if (!sheet) { rebuildP4MasterTab_(); sheet = ss.getSheetByName(P4_MASTER_SHEET); }

  const rows = readP4MasterTab_(sheet);
  return { status: "ok", action: "devices", count: rows.length, data: rows };
}

// The actual (slow) 10-sheet scan — only ever called by rebuildP4MasterTab_,
// never directly by a doGet request.
function computeP4DevicesData_(ss) {
  const configSheet = ss.getSheetByName("config_centers");

  if (!configSheet) {
    throw new Error("Missing sheet: config_centers");
  }

  const configs = sheetToObjects(configSheet)
    .filter(row =>
      String(row.active).toUpperCase() === "TRUE" &&
      String(row.type || "").trim() === "repair_center"
    );

  const allRows = [];

  configs.forEach(center => {
    const tabName = String(center.tab_name || "").trim();
    const sheet = ss.getSheetByName(tabName);

    if (!sheet) return;

    const rows = sheetToObjects(sheet);

    rows.forEach(row => {
      const itemName = pick(row, ["รายการ", "รายการ_อุปกรณ์", "ชื่อรายการ"]);
      if (!itemName) return;

      allRows.push({
        center_name: center.center_name,
        tab_name: tabName,
        district: center.district,

        category: pick(row, ["กลุ่ม", "กลุ่ม_อุปกรณ์ที่พร้อมให้บริการ"]),
        item: itemName,
        unit: pick(row, ["หน่วย", "อุปกรณ์_หน่วย"]),

        buy66: num(pick(row, ["จำนวนที่ซื้อ ปี 66", "จำนวนที่ซื้อ ปี66", "จัดซื้อ_ปี66"])),
        paid66: num(pick(row, ["จำนวนเบิกจ่าย ปี 66", "จำนวนเบิกจ่าย ปี66", "เบิกจ่าย_ปี66"])),
        balance66: num(pick(row, ["คงเหลือ ปี 66", "คงเหลือ ปี66", "ยอดสุทธิ_ปี66"])),

        buy67: num(pick(row, ["จำนวนที่ซื้อ ปี 67", "จำนวนที่ซื้อ ปี67", "จัดซื้อ_ปี67"])),
        paid67: num(pick(row, ["จำนวนเบิกจ่าย ปี 67", "จำนวนเบิกจ่าย ปี67", "เบิกจ่าย_ปี67"])),
        balance67: num(pick(row, ["คงเหลือ ปี 67", "คงเหลือ ปี67", "คงเหลือ ปี 67 (ก่อนเบิกจ่าย)", "ยอดสุทธิ_ปี67"])),

        buy68: num(pick(row, ["จำนวนที่ซื้อ ปี 68", "จำนวนที่ซื้อ ปี68", "จำนวนที่ซื้อ ปี 68 ระยะ 1", "จำนวนที่ซื้อ ปี68 ระยะ1", "จำนวนที่ซื้อ ปี 68 ระยะ 2", "จำนวนที่ซื้อ ปี68 ระยะ2", "จัดซื้อ_ปี68"])),
        balance68_before: num(pick(row, ["คงเหลือ ปี 68 (ก่อนเบิกจ่าย)", "คงเหลือ ปี68 (ก่อนเบิกจ่าย)", "รวมก่อนเบิก_ปี68_ระยะ1(ห้ามแก้ไข)"])),
        paid68: num(pick(row, ["จำนวนเบิกจ่าย ปี 68", "จำนวนเบิกจ่าย ปี68", "จำนวนเบิกจ่าย ปี 68 ระยะ 1", "จำนวนเบิกจ่าย ปี68 ระยะ1", "จำนวนเบิกจ่าย ปี 68 ระยะ 2", "จำนวนเบิกจ่าย ปี68 ระยะ2", "เบิกจ่าย_ปี68"])),
        balance68: num(pick(row, ["คงเหลือ ปี 68 (หลังเบิกจ่าย)", "คงเหลือ ปี68 (หลังเบิกจ่าย)", "ยอดสุทธิ_ปี68(ห้ามแก้ไข)", "ยอดคงเหลือ_ปี68_ระยะ1(ห้ามแก้ไข)"])),

        buy69: num(pick(row, ["จำนวนที่ซื้อ ปี 69", "จำนวนที่ซื้อ ปี69", "จัดซื้อ_ปี69"])),
        balance69_before: num(pick(row, ["คงเหลือ ปี 69 (ก่อนเบิกจ่าย)", "คงเหลือ ปี69 (ก่อนเบิกจ่าย)"])),
        paid69: num(pick(row, ["จำนวนเบิกจ่าย ปี 69", "จำนวนเบิกจ่าย ปี69", "เบิกจ่าย_ปี69"])),
        balance69: num(pick(row, ["คงเหลือ ปี 69 (หลังเบิกจ่าย)", "คงเหลือ ปี69 (หลังเบิกจ่าย)", "ยอดสุทธิ_ปี69(ห้ามแก้ไข)"]))
      });
    });
  });

  return allRows;
}

function getUserGroupsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("กลุ่มผู้ใช้บริการ");

  if (!sheet) {
    throw new Error("Missing sheet: กลุ่มผู้ใช้บริการ");
  }

  const rows = sheetToObjects(sheet).map(row => ({
    district: pick(row, ["อำเภอ"]),
    center_name: pick(row, ["หน่วยงานที่ตั้งศูนย์ซ่อม", "หน่วยงาน_ที่ตั้งศูนย์ซ่อม"]),
    category: pick(row, ["กลุ่มอุปกรณ์ที่พร้อมให้บริการ", "กลุ่ม_อุปกรณ์ที่พร้อมให้บริการ"])
  }));

  return {
    status: "ok",
    action: "user_groups",
    count: rows.length,
    data: rows
  };
}

function getFundingData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("งบประมาณสนับสนุน");

  if (!sheet) {
    throw new Error("Missing sheet: งบประมาณสนับสนุน");
  }

  const rows = sheetToObjects(sheet).map(row => ({
    budget_year: pick(row, ["ปีงบประมาณ", "ปี_งบประมาณ"]),
    agency: pick(row, ["หน่วยงาน", "ชื่อ_หน่วยงาน"]),
    submit_date: pick(row, ["วันที่ส่งโครงการฯ", "วันที่_ส่งโครงการฯ"]),
    approve_date: pick(row, ["วันที่อนุมัติ", "วันที่_อนุมัติ"]),
    mou_date: pick(row, ["วันที่ทำ MOU", "วันที่_ทำMOU"]),
    check_date: pick(row, ["วันที่รับเช็ค", "วันที่_รับเช็ค"]),
    report_date: pick(row, ["วันที่ส่งรายงานผล", "วันที่_ส่งรายงานผล"]),
    budget: num(pick(row, ["จำนวนเงิน", "งบประมาณ_จำนวนเงิน", "งบประมาณ"])),
    remark: pick(row, ["หมายเหตุ"])
  }));

  return {
    status: "ok",
    action: "funding",
    count: rows.length,
    data: rows
  };
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(h => String(h).trim());

  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = row[index];
      }
    });
    return obj;
  });
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function num(value) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return value;

  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);

  return isNaN(n) ? 0 : n;
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
