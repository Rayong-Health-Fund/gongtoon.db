// ============================================================
// Project 4 — Equipment Repair Center API (Google Apps Script)
// ============================================================
// Deployed as a Web App (Execute as: Me, Access: Anyone).
//
// Supported query parameters:
//   ?action=devices      — equipment device rows
//   ?action=funding      — budget / funding records
//   ?action=user_groups  — center configuration (active / inactive)
//   &refresh=1           — bypass cache and rebuild from sheet
//
// Response envelope (same shape for all actions):
//   {
//     "data":         [ {...}, ... ],   // array of row objects
//     "cached":       true | false,
//     "generated_at": "ISO-8601 string"
//   }
//
// Cache: CacheService.getScriptCache(), 10-minute TTL per action.
// ============================================================

// ── Sheet name constants (update to match your Google Sheet) ──
var SHEET_DEVICES    = 'ข้อมูลอุปกรณ์';   // device data sheet
var SHEET_FUNDING    = 'งบประมาณ';         // budget / funding sheet
var SHEET_CENTERS    = 'config_centers';    // center config sheet

// Cache settings
var CACHE_TTL_SECONDS = 10 * 60;           // 10 minutes

// ─────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────
function doGet(e) {
  var params       = (e && e.parameter)          || {};
  var action       = String(params.action        || '').trim();
  var forceRefresh = (params.refresh === '1' || params.refresh === 'true');

  var result;

  try {
    switch (action) {
      case 'devices':
        result = withCache('p4_devices_v1', forceRefresh, buildDevicesData);
        break;

      case 'funding':
        result = withCache('p4_funding_v1', forceRefresh, buildFundingData);
        break;

      case 'user_groups':
        result = withCache('p4_user_groups_v1', forceRefresh, buildUserGroupsData);
        break;

      default:
        result = {
          data: [],
          error: 'Unknown action: "' + action + '". Use devices | funding | user_groups.',
          cached: false,
          generated_at: new Date().toISOString()
        };
    }
  } catch (err) {
    result = {
      data: [],
      error: String(err),
      cached: false,
      generated_at: new Date().toISOString()
    };
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────
// Cache wrapper
//   cacheKey     — unique string key for this action
//   forceRefresh — when true, skip cache read and rebuild data
//   buildFn      — zero-argument function that returns {data:[...]}
// ─────────────────────────────────────────────────────────────
function withCache(cacheKey, forceRefresh, buildFn) {
  var cache = CacheService.getScriptCache();

  // ── Try reading from cache ──
  if (!forceRefresh) {
    var hit = cache.get(cacheKey);
    if (hit) {
      try {
        var parsed = JSON.parse(hit);
        parsed.cached = true;           // flag so callers know this came from cache
        return parsed;
      } catch (e) {
        // Cache entry is corrupt (e.g. truncated) — fall through to rebuild
      }
    }
  }

  // ── Build fresh data from sheet ──
  var fresh = buildFn();
  fresh.cached       = false;
  fresh.generated_at = new Date().toISOString();

  // ── Store in cache ──
  // CacheService has a per-value hard limit of 100 KB.
  // If the payload is too large the put() call throws; we catch it and
  // serve the data uncached rather than failing the whole request.
  try {
    var serialized = JSON.stringify(fresh);
    if (serialized.length <= 100000) {
      cache.put(cacheKey, serialized, CACHE_TTL_SECONDS);
    }
    // If > 100 KB, silently skip caching and let each request hit the sheet.
    // Consider splitting large sheets into smaller named ranges if this occurs.
  } catch (e) {
    // cache.put() failed — data is still returned uncached
  }

  return fresh;
}

// ─────────────────────────────────────────────────────────────
// Data builders — each returns { data: [ rowObjects ] }
// ─────────────────────────────────────────────────────────────

// Reads every non-blank data row from SHEET_DEVICES.
// Column headers become object keys, preserving exact Thai names so the
// frontend normalizer (p4NormalizeDevices) can map them directly.
function buildDevicesData() {
  var rows = sheetToObjects(SHEET_DEVICES);

  // Optionally filter rows to active centers only.
  // If config_centers is unavailable or empty, all rows are returned.
  var activeCenters = getActiveCenterNames();
  if (activeCenters !== null) {
    rows = rows.filter(function(row) {
      // Match against the Thai "หน่วยงาน" column (and English alias)
      var centerName = String(
        row['หน่วยงาน_ที่ตั้งศูนย์ซ่อม'] || row['center_name'] || ''
      ).trim();
      return activeCenters[centerName] === true;
    });
  }

  return { data: rows };
}

// Reads budget / funding rows from SHEET_FUNDING.
function buildFundingData() {
  var rows = sheetToObjects(SHEET_FUNDING);
  return { data: rows };
}

// Reads center configuration from SHEET_CENTERS and returns all rows.
// Callers can inspect the "active" column to determine center status.
function buildUserGroupsData() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CENTERS);
  if (!sheet) return { data: [] };

  var rows = sheetToObjects(SHEET_CENTERS);
  return { data: rows };
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

// Converts a named sheet into an array of plain objects using the first
// row as column headers. Blank rows (all cells empty) are skipped.
function sheetToObjects(sheetName) {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: "' + sheetName + '"');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  var headers = values[0].map(function(h) { return String(h).trim(); });
  var rows    = [];

  for (var i = 1; i < values.length; i++) {
    var row     = values[i];
    var allBlank = true;

    // Quick blank-row check before building the object
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
        allBlank = false;
        break;
      }
    }
    if (allBlank) continue;

    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      if (!headers[j]) continue;             // skip columns with no header
      var val = row[j];
      // Convert Date objects to ISO strings so JSON.stringify produces consistent output
      if (val instanceof Date) {
        obj[headers[j]] = Utilities.formatDate(val, 'Asia/Bangkok', 'dd/MM/yyyy');
      } else {
        obj[headers[j]] = (val !== null && val !== undefined) ? val : '';
      }
    }
    rows.push(obj);
  }

  return rows;
}

// Returns a lookup object { centerName: true } for active centers, or
// null if the config sheet does not exist (so the caller returns all rows).
function getActiveCenterNames() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_CENTERS);
  if (!sheet) return null;

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  var headers = values[0].map(function(h) { return String(h).trim().toLowerCase(); });
  // Locate the "name" column and "active" column (accepts common Thai/English variants)
  var nameIdx   = findColIndex(headers, ['center_name', 'ชื่อ_หน่วยงาน', 'ชื่อหน่วยงาน', 'name']);
  var activeIdx = findColIndex(headers, ['active', 'สถานะ', 'เปิดใช้งาน', 'ใช้งาน']);

  // If the sheet exists but has no recognizable active column, treat all as active
  if (nameIdx === -1) return null;
  if (activeIdx === -1) return null;

  var lookup = {};
  for (var i = 1; i < values.length; i++) {
    var centerName = String(values[i][nameIdx] || '').trim();
    var isActive   = values[i][activeIdx];
    // Accepts TRUE (boolean), "true", "yes", "1", "active", "ใช้งาน" etc.
    var active = (isActive === true ||
                  String(isActive).toLowerCase() === 'true' ||
                  String(isActive).toLowerCase() === 'yes'  ||
                  String(isActive) === '1');
    if (centerName && active) lookup[centerName] = true;
  }
  return lookup;
}

// Finds the first matching column index from a list of candidate names.
function findColIndex(headers, candidates) {
  for (var i = 0; i < candidates.length; i++) {
    var idx = headers.indexOf(candidates[i]);
    if (idx !== -1) return idx;
  }
  return -1;
}

// ─────────────────────────────────────────────────────────────
// Manual cache invalidation helper
// Run this function from the Apps Script editor to clear all P4 caches immediately.
// ─────────────────────────────────────────────────────────────
function clearP4Cache() {
  var cache = CacheService.getScriptCache();
  cache.removeAll(['p4_devices_v1', 'p4_funding_v1', 'p4_user_groups_v1']);
  Logger.log('P4 cache cleared.');
}
