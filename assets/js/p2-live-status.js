// P2 (ศูนย์สาธิตและยืมอุปกรณ์ฯ) data with live equipment counts.
//
// Budgets, units and the item list come from equipment-loan/data/dashboard_data.json
// (built from the Fund's Excel reports). Equipment counts per unit/item are then
// replaced by the "สถานะปัจจุบัน" tab of the borrow/return ledger Sheet, which
// service-unit staff update through report-p2-equipment.html. That tab is
// published as CSV and holds no reporter details (name/phone/email stay in the
// Sheet's private log tab).
//
// If the Sheet can't be read, the Excel figures are used as before.
//
// Usage: loadP2Data().then(function (json) { ... })
//   json.live = { ok: true|false, updatedAt: 'yyyy-MM-dd HH:mm:ss' | '' }
(function () {
  var DATA_URL = 'equipment-loan/data/dashboard_data.json';
  var STATUS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSsTrSZ9fcpAcI_YOR7vOp9DWBRTii9ln-gjnX8UZlNcmaGaTjfKgkPAMxMbWc61hWq0nyeA2XOR3-n/pub?gid=1718842841&single=true&output=csv';
  var TIMEOUT_MS = 8000;

  function parseCsv(text) {
    var rows = [], row = [], field = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
  }
  function num(v) { var n = Number(String(v || '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; }

  function readStatus(text) {
    var rows = parseCsv(text.replace(/^﻿/, ''));
    var head = (rows[0] || []).map(function (h) { return h.trim(); });
    var col = {};
    ['อำเภอ', 'หน่วยบริการ', 'ชื่ออุปกรณ์', 'พร้อมให้ยืม', 'ยืมใช้งาน', 'ชำรุด', 'จำหน่าย', 'อัปเดตล่าสุด'].forEach(function (n) {
      col[n] = head.indexOf(n);
    });
    if (col['หน่วยบริการ'] < 0 || col['พร้อมให้ยืม'] < 0) throw new Error('unexpected status sheet header');
    var map = {};
    rows.slice(1).forEach(function (r) {
      map[r[col['อำเภอ']] + '|' + r[col['หน่วยบริการ']] + '|' + r[col['ชื่ออุปกรณ์']]] = {
        available: num(r[col['พร้อมให้ยืม']]), borrowed: num(r[col['ยืมใช้งาน']]),
        damaged: num(r[col['ชำรุด']]), disposed: num(r[col['จำหน่าย']]),
        updated: col['อัปเดตล่าสุด'] < 0 ? '' : String(r[col['อัปเดตล่าสุด']] || '')
      };
    });
    return map;
  }

  function merge(json, live) {
    var latest = '';
    json.equipment.forEach(function (e) {
      var s = live[e.district + '|' + e.agency + '|' + e.equipment_name];
      if (!s) return;
      e.available_qty = s.available;
      e.borrowed_qty = s.borrowed;
      e.damaged_qty = s.damaged;
      e.disposed_qty = s.disposed;
      e.total_supported_qty = s.available + s.borrowed + s.damaged;
      if (s.updated > latest) latest = s.updated;
    });
    var byUnit = {};
    json.equipment.forEach(function (e) {
      var k = e.district + '|' + e.agency;
      var t = byUnit[k] || (byUnit[k] = { available: 0, borrowed: 0, damaged: 0, disposed: 0 });
      t.available += e.available_qty; t.borrowed += e.borrowed_qty;
      t.damaged += e.damaged_qty; t.disposed += e.disposed_qty;
    });
    json.units.forEach(function (u) {
      var t = byUnit[u.district + '|' + u.agency];
      if (!t) return;
      u.available_qty = t.available; u.borrowed_qty = t.borrowed;
      u.damaged_qty = t.damaged; u.disposed_qty = t.disposed;
      u.total_qty = t.available + t.borrowed + t.damaged;
    });
    json.live = { ok: true, updatedAt: latest };
    return json;
  }

  function fetchStatus() {
    var url = STATUS_CSV_URL + '&t=' + Math.floor(Date.now() / 60000);
    var req = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('status sheet HTTP ' + r.status);
      return r.text();
    });
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('status sheet timed out')); }, TIMEOUT_MS);
    });
    return Promise.race([req, timeout]);
  }

  var cached = null;
  window.loadP2Data = function () {
    if (cached) return cached;
    var base = fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error('P2 data file HTTP ' + r.status);
      return r.json();
    });
    var status = fetchStatus().then(readStatus, function (err) {
      console.warn('[P2] live status unavailable, using Excel figures:', err.message);
      return null;
    }).catch(function (err) {
      console.warn('[P2] live status unreadable, using Excel figures:', err.message);
      return null;
    });
    cached = Promise.all([base, status]).then(function (both) {
      var json = both[0];
      if (both[1]) return merge(json, both[1]);
      json.live = { ok: false, updatedAt: '' };
      return json;
    });
    cached.catch(function () { cached = null; });
    return cached;
  };
})();
