// Builds the data file index.html's P2 tab (ศูนย์สาธิตและยืมอุปกรณ์ฯ) reads.
//
// Sources, in order of authority:
//   1. "เอกสารแนบ 4 รายงานศูนย์สาธิต.xlsx" — the report presented at the
//      committee meeting. Every unit, its total budget, and every item's
//      status counts (ยืมใช้งาน / พร้อมให้ยืม / ชำรุด / จำหน่าย) come from here.
//   2. "โครงการศูนย์สาธิตและยืมอุปกรณ์ฯ อัพเดท กันยายน 2569.xlsx" — the
//      Fund's working file. Only used for what เอกสารแนบ 4 doesn't break
//      down: how much each unit received per fiscal year, and how many of
//      each item were bought in which year (for the page's year filter).
//   3. "Project_2_data_equipment_loan - all_map_destination.csv" — service
//      unit contact details (phone, Google Maps link) for the map tab.
//
// Output keeps the shape the page already expects (equipment/map/
// ref_equipment/funding) and adds `units` (one row per unit, budget per
// year + total, straight from the reports) and `overview` (the district
// table on เอกสารแนบ 4's first sheet).
//
// No borrower names or ID numbers exist in any of these sources.
//
// Usage: npm run data:p2  (re-run whenever new reports arrive)

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SRC = path.join(__dirname, 'source');
const REPORT_XLSX = path.join(SRC, 'เอกสารแนบ 4 รายงานศูนย์สาธิต.xlsx');
const WORKING_XLSX = path.join(SRC, 'โครงการศูนย์สาธิตและยืมอุปกรณ์ฯ อัพเดท กันยายน 2569.xlsx');
const MAP_CSV = path.join(SRC, 'Project_2_data_equipment_loan - all_map_destination.csv');
const OUTPUT_JSON = path.join(__dirname, 'data', 'dashboard_data.json');

const STATUS_ROWS = { 'ยืมใช้งาน': 'borrowed', 'พร้อมให้ยืม': 'available', 'จำหน่าย': 'disposed', 'ชำรุด': 'damaged' };

function text(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function num(v) { const n = Number(String(v == null ? '' : v).replace(/[^\d.-]/g, '')); return isFinite(n) ? n : 0; }
function rowsOf(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); }

// Loose key for matching the same unit/item across the two workbooks,
// which spell things slightly differently ("รพ.เขาชะเมาฯ" vs "รพ.เขาชะเมา",
// "(Walker)" vs "(walker)", stray spaces).
function key(s) {
  return text(s).replace(/^\d+\./, '').replace(/[\sฯ().]/g, '').toLowerCase();
}

// "เมือง" sheet / "อำเภอเมืองระยอง" heading -> "เมืองระยอง"
function districtFromSheet(name) {
  const d = text(name).replace(/^อ\./, '');
  return d === 'เมือง' ? 'เมืองระยอง' : d;
}

// ── 1. เอกสารแนบ 4 ────────────────────────────────────────────────────────
function readReport() {
  const wb = XLSX.readFile(REPORT_XLSX);
  const overview = [];
  rowsOf(wb.Sheets[wb.SheetNames[0]]).forEach(r => {
    if (/^\d+$/.test(text(r[0])) && text(r[1])) {
      overview.push({ district: districtFromSheet(r[1]), units: num(r[2]), budget: num(r[3]) });
    }
  });

  const units = [];
  let items = null;
  wb.SheetNames.slice(1).forEach(sheet => {
    const district = districtFromSheet(sheet);
    const rows = rowsOf(wb.Sheets[sheet]);
    const headerRow = rows.find(r => /^1\./.test(text(r[4])));
    if (!headerRow) throw new Error('item header row not found on sheet ' + sheet);
    const sheetItems = headerRow.slice(4).map(text).filter(Boolean);
    if (!items) items = sheetItems;
    else if (sheetItems.join('|') !== items.join('|')) throw new Error('item columns differ on sheet ' + sheet);

    let unit = null;
    rows.forEach(r => {
      const label = text(r[3]);
      if (label === 'ทั้งหมด' && text(r[1])) {
        const m = text(r[1]).match(/^(.*?)\s*\(([^)]*)\)\s*$/);
        unit = {
          district,
          agency: m ? m[1].trim() : text(r[1]),
          years: m ? m[2].trim() : '',
          budget: num(r[2]),
          qty: {}
        };
        units.push(unit);
        items.forEach((name, i) => { unit.qty[name] = { total: num(r[4 + i]) }; });
      } else if (unit && STATUS_ROWS[label]) {
        items.forEach((name, i) => { unit.qty[name][STATUS_ROWS[label]] = num(r[4 + i]); });
      }
    });
  });
  return { overview, units, items };
}

// ── 2. working file: per-year money + per-year item purchases ───────────
function readWorkingFile() {
  const wb = XLSX.readFile(WORKING_XLSX);
  const byUnit = {};
  wb.SheetNames.forEach(sheet => {
    const district = districtFromSheet(sheet);
    const rows = rowsOf(wb.Sheets[sheet]);
    const itemCols = rows[0].map((h, i) => ({ k: key(h), i })).filter(c => c.i >= 3 && c.k);
    let cur = null;
    rows.slice(1).forEach(r => {
      if (text(r[0])) {
        cur = { district, name: text(r[0]), years: {}, qtyByYear: {} };
        byUnit[district + '|' + key(r[0])] = cur;
      }
      const y = (text(r[1]).match(/^(25\d\d)/) || [])[1];
      if (!cur || !y) return;
      cur.years[y] = (cur.years[y] || 0) + num(r[2]);
      itemCols.forEach(c => {
        const q = num(r[c.i]);
        if (q > 0) {
          const byYear = cur.qtyByYear[c.k] || (cur.qtyByYear[c.k] = {});
          byYear[y] = (byYear[y] || 0) + q;
        }
      });
    });
  });
  return byUnit;
}

// ── 3. contact list for the map tab ─────────────────────────────────────
function parseCsv(textIn) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < textIn.length; i++) {
    const c = textIn[i];
    if (q) {
      if (c === '"') { if (textIn[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell !== ''));
}

function readMap() {
  if (!fs.existsSync(MAP_CSV)) return [];
  const rows = parseCsv(fs.readFileSync(MAP_CSV, 'utf8').replace(/^﻿/, ''));
  const idx = {};
  rows[0].forEach((h, i) => { idx[h.trim()] = i; });
  return rows.slice(1).map(c => ({
    agency_type: text(c[idx['ประเภท_หน่วยงาน']]),
    agency: text(c[idx['ชื่อ_หน่วยงาน']]),
    subdistrict: text(c[idx['ชื่อ_ตำบล']]),
    district: text(c[idx['ชื่อ_อำเภอ']]),
    phone: text(c[idx['เบอร์โทร']]),
    google_map_link: text(c[idx['link_google_map']])
  })).filter(r => r.agency);
}

function main() {
  const report = readReport();
  const working = readWorkingFile();
  const warnings = [];

  const ref_equipment = report.items.map(name => {
    const m = name.match(/^(\d+)\.(.*)$/);
    return { equipment_no: 'รายการที่ ' + m[1], equipment_name: m[2].trim() };
  });
  const cleanName = name => name.replace(/^\d+\./, '').trim();

  const equipment = [];
  const units = report.units.map(u => {
    const w = working[u.district + '|' + key(u.agency)];
    if (!w) warnings.push('no per-year breakdown in working file for ' + u.agency + ' (' + u.district + ')');

    const budgetByYear = {};
    if (w) {
      Object.keys(w.years).forEach(y => { budgetByYear[y] = w.years[y]; });
      const sum = Object.values(budgetByYear).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - u.budget) > 1) {
        warnings.push(u.agency + ': per-year amounts in working file sum to ' + sum + ', เอกสารแนบ 4 says ' + u.budget);
      }
    }

    let totals = { available: 0, borrowed: 0, damaged: 0, disposed: 0 };
    report.items.forEach(item => {
      const q = u.qty[item];
      if (!q || !(q.total || q.borrowed || q.available || q.damaged || q.disposed)) return;
      const row = {
        district: u.district,
        agency: u.agency,
        equipment_name: cleanName(item),
        available_qty: q.available || 0,
        active_qty: 0,
        damaged_qty: q.damaged || 0,
        borrowed_qty: q.borrowed || 0,
        disposed_qty: q.disposed || 0,
        total_supported_qty: (q.available || 0) + (q.borrowed || 0) + (q.damaged || 0)
      };
      const byYear = w && w.qtyByYear[key(item)];
      if (byYear) Object.keys(byYear).forEach(y => { row['budget_' + y] = byYear[y]; });
      equipment.push(row);
      Object.keys(totals).forEach(k => { totals[k] += q[k] || 0; });
    });

    return {
      district: u.district,
      agency: u.agency,
      years: u.years,
      budget: u.budget,
      budget_by_year: budgetByYear,
      available_qty: totals.available,
      borrowed_qty: totals.borrowed,
      damaged_qty: totals.damaged,
      disposed_qty: totals.disposed,
      total_qty: totals.available + totals.borrowed + totals.damaged
    };
  });

  // Cross-check the unit rows against เอกสารแนบ 4's own district table.
  report.overview.forEach(o => {
    const us = units.filter(u => u.district === o.district);
    const sum = us.reduce((a, u) => a + u.budget, 0);
    if (us.length !== o.units || Math.abs(sum - o.budget) > 1) {
      warnings.push(o.district + ': sheet has ' + us.length + ' units / ' + sum + ', ภาพรวม says ' + o.units + ' / ' + o.budget);
    }
  });

  // Same per-year money rows the old file had, now incl. 2569.
  const years = [...new Set(units.flatMap(u => Object.keys(u.budget_by_year)))].sort();
  const funding = units.map(u => {
    const row = { district: u.district, agency: u.agency };
    years.forEach(y => { row['budget_' + y] = u.budget_by_year[y] || 0; });
    return row;
  });

  const output = {
    ok: true,
    project: 'P2',
    source: path.basename(REPORT_XLSX),
    generatedAt: new Date().toISOString(),
    overview: report.overview,
    units,
    equipment,
    map: readMap(),
    ref_equipment,
    funding
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  const total = units.reduce((a, u) => a + u.budget, 0);
  console.log('P2: ' + units.length + ' units, ' + total.toLocaleString() + ' บาท, '
    + equipment.length + ' unit×item rows -> ' + OUTPUT_JSON);
  warnings.forEach(w => console.warn('  ! ' + w));
}

main();
