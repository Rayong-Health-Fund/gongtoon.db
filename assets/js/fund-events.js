// Fund activity calendar data (ประชุม / โครงการ / ลงพื้นที่ ...).
//
// Fund staff type activities into a Google Sheet tab "กิจกรรม" and publish that
// tab as CSV. Columns (header names must match; order doesn't matter):
//   วันที่เริ่ม | วันที่สิ้นสุด | เวลา | ประเภท | หัวข้อ | รายละเอียด |
//   สถานที่ | กลุ่มเป้าหมาย | ผู้จัด/ผู้รับผิดชอบ | สถานะ
// Dates may be 5/11/2569, 5/11/2026, 2026-11-05 or "5 พ.ย. 2569".
// สถานะ: blank = ปกติ, or "เลื่อน" / "ยกเลิก" (shown crossed out, not hidden).
//
// While EVENTS_CSV_URL is empty the pages show sample events marked "ตัวอย่าง".
//
// Usage: FundEvents.load().then(function (res) { res.events, res.demo, res.ok })
(function () {
  var EVENTS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT8an2rO7nFfXu6d6YoqCvtGb9oyNCXQchlJPphTNyp6I3xWlt02dEaXBrbxTdyUx-3kHaRH1_ip64b/pub?gid=1851717894&single=true&output=csv';
  var TIMEOUT_MS = 8000;

  var TYPES = [
    { key: 'ประชุม', icon: '🏛️', color: '#2563eb', bg: '#eff6ff', match: /ประชุม/ },
    { key: 'ลงพื้นที่', icon: '🚐', color: '#d97706', bg: '#fffbeb', match: /ลงพื้นที่|เยี่ยม|ติดตาม|ตรวจ/ },
    { key: 'โครงการ/อบรม', icon: '📋', color: '#0f766e', bg: '#f0fdfa', match: /โครงการ|อบรม|สัมมนา|กิจกรรม|ประชาสัมพันธ์/ },
    { key: 'วันหยุด', icon: '🎌', color: '#e11d48', bg: '#fff1f2', match: /หยุด/ },
    { key: 'อื่นๆ', icon: '📌', color: '#64748b', bg: '#f8fafc', match: /.*/ }
  ];
  var MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  var MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  var DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

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

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toDate(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(s, n) { var d = toDate(s); d.setDate(d.getDate() + n); return ymd(d); }

  // Any of the date spellings staff are likely to type -> 'yyyy-mm-dd' ('' if unreadable).
  function parseDate(v) {
    v = String(v || '').trim();
    if (!v) return '';
    var y, m, d, x;
    if ((x = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { y = +x[1]; m = +x[2]; d = +x[3]; }
    else if ((x = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { d = +x[1]; m = +x[2]; y = +x[3]; }
    else {
      x = v.match(/^(\d{1,2})\s*([ก-๙.]+)\s*(\d{2,4})/);
      if (!x) return '';
      var name = x[2].replace(/\s/g, '');
      m = 0;
      MONTHS.forEach(function (n, i) { if (n === name) m = i + 1; });
      MONTHS_SHORT.forEach(function (n, i) { if (n === name || n.replace(/\./g, '') === name.replace(/\./g, '')) m = i + 1; });
      if (!m) return '';
      d = +x[1]; y = +x[3];
    }
    if (y < 100) y += y > 50 ? 2500 : 2000; // "69" -> 2569, "26" -> 2026
    if (y > 2400) y -= 543;                  // Buddhist year
    if (y < 2000 || y > 2100) return '';     // typo such as "269" -> treat as blank
    var dt = new Date(y, m - 1, d);
    if (isNaN(dt) || dt.getMonth() !== m - 1) return '';
    return ymd(dt);
  }

  function typeOf(ev) {
    var t = String(ev.type || '') + ' ' + (ev.type ? '' : ev.title || '');
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].match.test(t)) return TYPES[i];
    return TYPES[TYPES.length - 1];
  }

  function fmtDay(s, opts) {
    var d = toDate(s);
    return (opts && opts.weekday ? 'วัน' + DAYS[d.getDay()] + 'ที่ ' : '') + d.getDate() + ' ' +
      (opts && opts.short ? MONTHS_SHORT : MONTHS)[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }
  function fmtRange(ev, opts) {
    if (ev.end === ev.start) return fmtDay(ev.start, opts);
    var a = toDate(ev.start), b = toDate(ev.end);
    if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth())
      return a.getDate() + '–' + fmtDay(ev.end, { short: opts && opts.short });
    return fmtDay(ev.start, { short: true }) + ' – ' + fmtDay(ev.end, { short: true });
  }

  // Whole days from today to the event (0 = today or ongoing, negative = over).
  function daysUntil(ev) {
    var today = ymd(new Date());
    if (ev.end < today) return -1;
    if (ev.start <= today) return 0;
    return Math.round((toDate(ev.start) - toDate(today)) / 86400000);
  }
  function whenLabel(ev) {
    var n = daysUntil(ev);
    if (n < 0) return /เสร็จ/.test(ev.status) ? 'เสร็จสิ้น' : 'ผ่านมาแล้ว';
    if (n === 0) return ev.end > ev.start && ev.start < ymd(new Date()) ? 'กำลังดำเนินการ' : 'วันนี้';
    if (n === 1) return 'พรุ่งนี้';
    return 'อีก ' + n + ' วัน';
  }
  function isCancelled(ev) { return /ยกเลิก/.test(ev.status); }
  function isPostponed(ev) { return /เลื่อน/.test(ev.status); }

  function onDate(events, s) {
    return events.filter(function (ev) { return s >= ev.start && s <= ev.end; });
  }

  // Link that opens "add to Google Calendar" with the details filled in (all-day,
  // because the time column is free text).
  function googleCalUrl(ev) {
    var details = [ev.time && 'เวลา: ' + ev.time, ev.audience && 'กลุ่มเป้าหมาย: ' + ev.audience,
      ev.organizer && 'ผู้จัด: ' + ev.organizer, ev.detail].filter(Boolean).join('\n');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(ev.title) +
      '&dates=' + ev.start.replace(/-/g, '') + '/' + addDays(ev.end, 1).replace(/-/g, '') +
      '&details=' + encodeURIComponent(details) +
      '&location=' + encodeURIComponent(ev.place || '');
  }

  var COLS = {
    start: ['วันที่เริ่ม', 'วันที่'], end: ['วันที่สิ้นสุด'], time: ['เวลา'], type: ['ประเภท'],
    title: ['หัวข้อ', 'หัวข้อการประชุม/กิจกรรม', 'ชื่อกิจกรรม'], detail: ['รายละเอียด'],
    place: ['สถานที่'], audience: ['กลุ่มเป้าหมาย'],
    organizer: ['ผู้จัด/ผู้รับผิดชอบ', 'ผู้จัด', 'ผู้รับผิดชอบ'], status: ['สถานะ']
  };
  function readEvents(text) {
    var rows = parseCsv(text.replace(/^﻿/, ''));
    var head = (rows[0] || []).map(function (h) { return h.trim(); });
    var idx = {};
    Object.keys(COLS).forEach(function (k) {
      idx[k] = -1;
      COLS[k].forEach(function (n) { if (idx[k] < 0) idx[k] = head.indexOf(n); });
    });
    if (idx.start < 0 || idx.title < 0) throw new Error('events sheet: missing วันที่เริ่ม/หัวข้อ column');
    return rows.slice(1).map(function (r) {
      var ev = {};
      Object.keys(idx).forEach(function (k) { ev[k] = idx[k] >= 0 ? String(r[idx[k]] || '').trim() : ''; });
      ev.start = parseDate(ev.start);
      ev.end = parseDate(ev.end) || ev.start;
      if (ev.end < ev.start) ev.end = ev.start;
      return ev;
    }).filter(function (ev) { return ev.start && ev.title; });
  }

  function demoEvents() {
    var t = ymd(new Date());
    function ev(off, len, type, title, time, place, audience, organizer, detail, status) {
      var s = addDays(t, off);
      return { start: s, end: addDays(s, len), type: type, title: title, time: time, place: place,
        audience: audience, organizer: organizer, detail: detail, status: status || '' };
    }
    return [
      ev(-6, 0, 'ประชุม', 'ประชุมคณะอนุกรรมการกองทุนฯ ครั้งที่ 9/2569', '09.00–12.00 น.', 'ห้องประชุม สปสช. เขต 6 ชั้น 2', 'คณะอนุกรรมการกองทุนฯ', 'เลขานุการกองทุนฯ', 'พิจารณาสรุปผลการดำเนินงานปีงบประมาณ 2569'),
      ev(0, 0, 'ลงพื้นที่', 'ติดตามบ้านปรับสภาพ อ.แกลง', '13.30–16.00 น.', 'ต.ทางเกวียน อ.แกลง', 'ผู้รับบริการโครงการปรับสภาพบ้าน', 'เจ้าหน้าที่กองทุนฯ ร่วมกับ อปท.', 'ตรวจรับงานบ้านที่ดำเนินการแล้วเสร็จ'),
      ev(3, 0, 'ประชุม', 'ประชุมคณะอนุกรรมการกองทุนฯ ครั้งที่ 1/2570', '09.00–12.00 น.', 'ห้องประชุมกองทุนฯ ชั้น 3', 'คณะอนุกรรมการกองทุนฯ', 'เลขานุการกองทุนฯ', 'พิจารณาโครงการปีงบประมาณ 2570'),
      ev(9, 1, 'โครงการ/อบรม', 'อบรมการใช้และดูแลอุปกรณ์ช่วยความพิการ', '08.30–16.30 น.', 'โรงแรมในตัวเมืองระยอง', 'เจ้าหน้าที่ รพ.สต. และ อสม.', 'ศูนย์สาธิตและยืมอุปกรณ์ฯ', 'รับสมัครหน่วยบริการละ 2 คน'),
      ev(16, 0, 'ลงพื้นที่', 'ออกหน่วยซ่อมอุปกรณ์เคลื่อนที่', '09.00–15.00 น.', 'วัดกระบกขึ้นผึ้ง ต.บ้านค่าย', 'ประชาชนที่มีอุปกรณ์ชำรุด', 'ศูนย์ซ่อมบำรุงฯ', 'นำรถเข็น/ไม้เท้าที่ชำรุดมาซ่อมได้ฟรี'),
      ev(23, 0, 'ประชุม', 'ประชุมเครือข่ายหน่วยบริการ', '13.00–16.00 น.', 'ออนไลน์ (Zoom)', 'ผู้รับผิดชอบโครงการทุกหน่วย', 'กองทุนฯ', '', 'เลื่อน')
    ];
  }

  var cached = null;
  function load() {
    if (cached) return cached;
    if (!EVENTS_CSV_URL) {
      cached = Promise.resolve({ ok: true, demo: true, events: sortEvents(demoEvents()) });
      return cached;
    }
    var url = EVENTS_CSV_URL + (EVENTS_CSV_URL.indexOf('?') < 0 ? '?' : '&') + 't=' + Math.floor(Date.now() / 60000);
    var req = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('events sheet HTTP ' + r.status);
      return r.text();
    });
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('events sheet timed out')); }, TIMEOUT_MS);
    });
    cached = Promise.race([req, timeout]).then(function (text) {
      return { ok: true, demo: false, events: sortEvents(readEvents(text)) };
    }).catch(function (err) {
      console.warn('[FundEvents]', err);
      cached = null;
      return { ok: false, demo: false, events: [] };
    });
    return cached;
  }
  function sortEvents(list) {
    return list.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  }

  window.FundEvents = {
    load: load, TYPES: TYPES, MONTHS: MONTHS, MONTHS_SHORT: MONTHS_SHORT,
    ymd: ymd, toDate: toDate, typeOf: typeOf, fmtDay: fmtDay, fmtRange: fmtRange,
    daysUntil: daysUntil, whenLabel: whenLabel, isCancelled: isCancelled, isPostponed: isPostponed,
    onDate: onDate, googleCalUrl: googleCalUrl
  };
})();
