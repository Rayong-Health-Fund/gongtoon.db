// P1 (ปรับสภาพบ้านฯ) data with houses registered through the house ledger.
//
// home-improvement/data/dashboard_data.json holds the houses from the Fund's
// report (เอกสารแนบ 6). Houses that อปท. staff register through
// report-p1-house.html come from the ledger Sheet's published "บ้านสาธารณะ"
// tab (masked names, no addresses, dropped projects left out). They are added
// to `records`, and summary / filters / charts / overview are recomputed the
// same way home-improvement/generate_data.js builds them.
//
// If the Sheet can't be read, the report figures are used as before.
//
// Usage: fetchP1Data().then(function (json) { ... })
//   json.live = { ok: true|false, added: n, updatedAt: 'yyyy-MM-dd HH:mm:ss' | '' }
(function () {
  var DATA_URL = 'home-improvement/data/dashboard_data.json';
  var HOUSES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTQskUZSyiftKPmxEwVjZzeIEFK4T6ihT_K5Cdc-17R7AVtMYRetK6LqBalqyMhyBDqrMTVnLPAkoAo/pub?gid=1177143487&single=true&output=csv';
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
  function unique(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) { v = String(v).trim(); if (v && !seen[v]) { seen[v] = true; out.push(v); } });
    return out;
  }

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

  // same aggregates as generate_data.js (buildSummary / buildFilters / buildChartAggregates)
  function rebuild(json) {
    var recs = json.records;
    var total = recs.reduce(function (s, r) { return s + (r.budget || 0); }, 0);
    json.summary = {
      totalRecords: recs.length,
      completed: recs.filter(function (r) { return r.projectStatus === 'แล้วเสร็จ'; }).length,
      inProgress: recs.filter(function (r) { return r.projectStatus === 'กำลังดำเนินการ'; }).length,
      totalBudget: Math.round(total * 100) / 100,
      districtCount: unique(recs.map(function (r) { return r.district; })).length,
      agencyCount: unique(recs.map(function (r) { return r.agency; })).length,
      averageBudgetPerRecord: recs.length ? Math.round(total / recs.length) : 0
    };
    json.filters = {
      years: unique(recs.map(function (r) { return r.sourceYearLabel; })),
      districts: unique(recs.map(function (r) { return r.district; })),
      subdistricts: unique(recs.map(function (r) { return r.subdistrict; })),
      agencies: unique(recs.map(function (r) { return r.agency; })),
      statuses: unique(recs.map(function (r) { return r.projectStatus; })),
      statusGroups: unique(recs.map(function (r) { return r.statusGroup; })),
      disabilityCodes: []
    };
    var byYear = {}, byDistrict = {}, byType = {}, byDisability = {}, byAge = [0, 0, 0, 0, 0];
    recs.forEach(function (r) {
      var y = r.sourceYearLabel || '—';
      if (!byYear[y]) byYear[y] = { budget: 0, count: 0 };
      byYear[y].budget += r.budget; byYear[y].count += 1;
      byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
      byType[r.statusGroup] = (byType[r.statusGroup] || 0) + 1;
      (r.disabilityTypes || []).forEach(function (d) { byDisability[d] = (byDisability[d] || 0) + 1; });
      var a = r.age;
      byAge[a < 20 ? 0 : a < 40 ? 1 : a < 60 ? 2 : a < 80 ? 3 : 4]++;
    });
    json.charts = { byYear: byYear, byDistrict: byDistrict, byType: byType, byDisability: byDisability, byAge: byAge };
  }

  function merge(json, rows) {
    var have = {}, latest = '', added = [];
    json.records.forEach(function (r) { have[r.refCode] = true; });
    rows.forEach(function (r) {
      var code = String(r['รหัสบ้าน'] || '').trim();
      if (!code || have[code]) return;
      have[code] = true;
      var agency = String(r['หน่วยดำเนินการ'] || '').trim();
      added.push({
        refCode: code, personName: r['ชื่อ (ปิดบางส่วน)'] || '', age: num(r['อายุ']),
        statusGroup: r['กลุ่มผู้รับบริการ'] || 'ไม่ระบุ', subdistrict: agency, district: r['อำเภอ'] || '',
        budget: Math.round(num(r['งบประมาณ']) * 100) / 100, sourceYearLabel: String(r['ปีงบประมาณ'] || '').trim(),
        projectStatus: r['สถานะ'] || 'กำลังดำเนินการ',
        disabilityTypes: String(r['ประเภทความพิการ'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        agency: agency
      });
      if (r['อัปเดตล่าสุด'] > latest) latest = r['อัปเดตล่าสุด'];
    });
    json.records = json.records.concat(added);
    added.forEach(function (r) {
      var o = json.overview && json.overview[r.district];
      if (o) { o.count += 1; o.budget = Math.round((o.budget + r.budget) * 100) / 100; }
    });
    rebuild(json);
    json.live = { ok: true, added: added.length, updatedAt: latest };
    return json;
  }

  var cached = null;
  window.fetchP1Data = function () {
    if (cached) return cached;
    var base = fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
    var live = fetchText(HOUSES_CSV_URL).then(parseCsv).catch(function (err) {
      console.warn('[P1] house ledger unavailable, using report figures:', err.message);
      return null;
    });
    cached = Promise.all([base, live]).then(function (both) {
      var json = both[0];
      if (both[1]) {
        // merge on a copy so a half-applied merge never reaches the page
        try { return merge(JSON.parse(JSON.stringify(json)), both[1]); }
        catch (e) { console.warn('[P1] house ledger unreadable, using report figures:', e.message); }
      }
      json.live = { ok: false, added: 0, updatedAt: '' };
      return json;
    });
    cached.catch(function () { cached = null; });
    return cached;
  };
})();
