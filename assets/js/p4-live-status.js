// P4 (ศูนย์ซ่อมบำรุงฯ) data with live figures from the repair-center ledger.
//
// device-repair/data/dashboard_data.json (built from the Fund's Excel reports)
// covers fiscal years up to 2569. From fiscal year 2570 on, repair-center staff
// log work through report-p4-repair.html; the ledger Sheet publishes two tabs
// with no reporter/recipient details:
//   "อะไหล่คงเหลือ" — carried / bought / used / remaining per centre, part and year
//   "สรุปงานซ่อม"   — equipment received for repair ("รับซ่อม") per centre, category
//                    and fiscal year of intake, plus the job-sheet numbers in each row
//                    ("เลขใบงาน"); older versions of the tab had "ซ่อมเสร็จ" instead
// Those years are merged into the same shape the page already reads
// (data_by_year, available_years, repairs[].by_year). One job sheet = one
// person served, so cases are counted as distinct job-sheet numbers (a sheet
// covering two kinds of equipment appears in two rows but counts once).
//
// If the Sheet can't be read, the Excel figures are used as before.
//
// Usage: fetchP4Data().then(function (json) { ... })
//   json.live = { ok: true|false, updatedAt: 'yyyy-MM-dd HH:mm:ss' | '', inProgress: n,
//                 cases: n, failed: n, casesByYear: { '2570': n } }
(function () {
  var DATA_URL = 'device-repair/data/dashboard_data.json';
  var BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRJaUWpK3WbLzRS7XTF1QUvIRoyZCH8FI2fHUU8n6FN4f2eqcCIb4R7IgZAG68emRAEKoYLTUcjPGLS/pub';
  var PARTS_CSV_URL = BASE + '?gid=1284077435&single=true&output=csv';
  var REPAIRS_CSV_URL = BASE + '?gid=1513094127&single=true&output=csv';
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

  function merge(json, parts, repairs) {
    var latest = '', inProgress = 0, failed = 0, caseIds = {}, casesByYear = {};
    var districtOf = {};
    (json.units || []).forEach(function (u) { districtOf[u.unit] = u.district; });

    // อะไหล่: ปีงบที่ Sheet ดูแล แทนที่ทั้งปี
    var byYear = {};
    parts.forEach(function (r) {
      var fy = String(r['ปีงบประมาณ'] || '').trim();
      if (!r['ศูนย์ซ่อม'] || !/^25\d\d$/.test(fy)) return;
      var bought = num(r['ซื้อเข้า']), used = num(r['เบิกใช้']);
      (byYear[fy] = byYear[fy] || []).push({
        district: r['อำเภอ'] || districtOf[r['ศูนย์ซ่อม']] || '', unit: r['ศูนย์ซ่อม'], category: r['กลุ่มอุปกรณ์'],
        equipment: r['อะไหล่'], unit_type: r['หน่วยนับ'], year: fy,
        purchased: bought, used: used, remaining: num(r['คงเหลือ']), carryForward: !bought && !used
      });
      if (r['อัปเดตล่าสุด'] > latest) latest = r['อัปเดตล่าสุด'];
    });
    Object.keys(byYear).forEach(function (fy) { json.data_by_year[fy] = byYear[fy]; });

    // งานซ่อม: เพิ่มยอดซ่อมเสร็จของปีงบนั้นเข้า repairs[].by_year
    var years = {};
    Object.keys(json.data_by_year).forEach(function (y) { years[y] = true; });
    repairs.forEach(function (r) {
      var fy = String(r['ปีงบประมาณ'] || '').trim();
      if (!r['ศูนย์ซ่อม'] || !/^25\d\d$/.test(fy)) return;
      years[fy] = true;
      // ตั้งแต่รุ่น 4 นับตอนรับซ่อม ("รับซ่อม") · แท็บรุ่นก่อนมีแต่ "ซ่อมเสร็จ"
      var done = num(r['รับซ่อม'] !== undefined ? r['รับซ่อม'] : r['ซ่อมเสร็จ']);
      inProgress += num(r['กำลังซ่อม']);
      failed += num(r['ซ่อมไม่ได้']);
      String(r['เลขใบงาน'] || '').split(/\s+/).forEach(function (id) {
        if (!id || caseIds[id]) return;
        caseIds[id] = true;
        casesByYear[fy] = (casesByYear[fy] || 0) + 1;
      });
      if (r['อัปเดตล่าสุด'] > latest) latest = r['อัปเดตล่าสุด'];
      var rep = json.repairs.filter(function (x) { return x.unit === r['ศูนย์ซ่อม'] && x.category === r['ประเภทอุปกรณ์']; })[0];
      if (!rep) {
        rep = { district: r['อำเภอ'] || districtOf[r['ศูนย์ซ่อม']] || '', unit: r['ศูนย์ซ่อม'],
          category: r['ประเภทอุปกรณ์'], unit_type: r['หน่วยนับ'], by_year: {}, total: 0 };
        json.repairs.push(rep);
        if (json.categories.indexOf(rep.category) < 0) json.categories.push(rep.category);
      }
      rep.by_year[fy] = (rep.by_year[fy] || 0) + done;
      rep.total = Object.keys(rep.by_year).reduce(function (s, y) { return s + (rep.by_year[y] || 0); }, 0);
    });

    json.available_years = Object.keys(years).sort().reverse();
    json.live = { ok: true, updatedAt: latest, inProgress: inProgress, failed: failed,
      cases: Object.keys(caseIds).length, casesByYear: casesByYear };
    return json;
  }

  var cached = null;
  window.fetchP4Data = function () {
    if (cached) return cached;
    var base = fetch(DATA_URL).then(function (r) {
      if (!r.ok) throw new Error('P4 data file HTTP ' + r.status);
      return r.json();
    });
    var live = Promise.all([fetchText(PARTS_CSV_URL), fetchText(REPAIRS_CSV_URL)]).then(function (t) {
      return [parseCsv(t[0]), parseCsv(t[1])];
    }).catch(function (err) {
      console.warn('[P4] live ledger unavailable, using Excel figures:', err.message);
      return null;
    });
    cached = Promise.all([base, live]).then(function (both) {
      var json = both[0];
      if (both[1]) {
        // merge on a copy so a half-applied merge never reaches the page
        try { return merge(JSON.parse(JSON.stringify(json)), both[1][0], both[1][1]); }
        catch (e) { console.warn('[P4] live ledger unreadable, using Excel figures:', e.message); }
      }
      json.live = { ok: false, updatedAt: '', inProgress: 0, failed: 0, cases: 0, casesByYear: {} };
      return json;
    });
    cached.catch(function () { cached = null; });
    return cached;
  };
})();
