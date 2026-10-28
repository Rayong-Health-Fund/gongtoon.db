// P3 (พัฒนาเครือข่ายบริการฯ) data with live project statuses.
//
// network-capacity/data/dashboard_data.json holds the Fund's project list
// ({y,d,u,b,n,s} records). Service units report through report-p3-network.html;
// the ledger Sheet publishes "โครงการสาธารณะ" (no reporter details):
//   - rows marked "โครงการเดิม" = existing projects that were still
//     "รอรายงานผล"; their status replaces the matching record (year + unit + name)
//   - other rows = newly registered projects, added as new records
//
// If the Sheet can't be read, the report figures are used as before.
//
// Usage: fetchP3Data().then(function (json) { ... })
//   json.live = { ok: true|false, added: n, updated: n }
(function () {
  var DATA_URL = 'network-capacity/data/dashboard_data.json';
  var PROJECTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vScULd_UpcTCQJZRMdu3tP82UNqle_71x8HQbg393UfUjolN1e8fPzMvVilVQ8ZSEK8LJZ-gIlNOPLF/pub?gid=372124477&single=true&output=csv';
  var TIMEOUT_MS = 8000;

  function parseCsv(text) {
    var rows = [], row = [], field = '', q = false;
    text = text.replace(/^﻿/, '');
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
    rows = rows.filter(function (r) { return r.some(function (x) { return x !== ''; }); });
    var head = (rows.shift() || []).map(function (h) { return h.trim(); });
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, i) { o[h] = r[i] == null ? '' : r[i]; });
      return o;
    });
  }
  function num(v) { var n = Number(String(v || '').replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; }
  function key(y, u, n) { return String(y).trim() + '|' + String(u).trim() + '|' + String(n).replace(/\s+/g, ' ').trim(); }

  function fetchText(url) {
    var req = fetch(url + '&t=' + Math.floor(Date.now() / 60000)).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    });
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timed out')); }, TIMEOUT_MS);
    });
    return Promise.race([req, timeout]);
  }

  function merge(json, rows) {
    var byKey = {}, added = 0, updated = 0;
    json.records.forEach(function (r) { byKey[key(r.y, r.u, r.n)] = r; });
    rows.forEach(function (row) {
      var y = num(row['ปีงบประมาณ']), u = row['หน่วยบริการ'], n = row['ชื่อโครงการ'], s = row['สถานะ'];
      if (!y || !u || !n || !s) return;
      var existing = byKey[key(y, u, n)];
      if (existing) {
        if (existing.s !== s) { existing.s = s; updated++; }
        return;
      }
      var rec = { y: y, d: row['อำเภอ'], u: u, b: num(row['งบประมาณ']), n: n, s: s };
      json.records.push(rec);
      byKey[key(y, u, n)] = rec;
      added++;
    });
    json.live = { ok: true, added: added, updated: updated };
    return json;
  }

  var cached = null;
  window.fetchP3Data = function () {
    if (cached) return cached;
    var base = fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    var live = fetchText(PROJECTS_CSV_URL).then(parseCsv).catch(function (err) {
      console.warn('[P3] project ledger unavailable, using report figures:', err.message);
      return null;
    });
    cached = Promise.all([base, live]).then(function (both) {
      var json = both[0];
      if (both[1]) {
        // merge on a copy so a half-applied merge never reaches the page
        try { return merge(JSON.parse(JSON.stringify(json)), both[1]); }
        catch (e) { console.warn('[P3] project ledger unreadable, using report figures:', e.message); }
      }
      json.live = { ok: false, added: 0, updated: 0 };
      return json;
    });
    cached.catch(function () { cached = null; });
    return cached;
  };
})();
