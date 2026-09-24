// Converts the P4 (ศูนย์ซ่อมบำรุงฯ) source CSVs into the ready-made data
// file index.html's P4 tab reads directly, in the exact project4Data
// shape (data_by_year/budgets/budget_totals/available_years/categories)
// the page already expects.
//
// The row-normalizing logic below (p4GetNum/p4GetText/p4SumThai/
// p4FormatDate/p4NormalizeDevices/p4NormalizeFunding/p4BuildData) is
// copied verbatim from assets/js/main.js's renderProject4Dashboard —
// that code already knows how to read this exact CSV's column names
// (it was written to read them straight from the Fund's Google Sheet,
// which mirrors this CSV), so re-using it here instead of re-deriving
// the multi-year/phase logic avoids getting a subtle detail wrong.
// If assets/js/main.js's p4Normalize* functions ever change, copy the
// updated versions here too.
//
// Usage: node generate_data.js — re-run whenever new source CSVs arrive.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'source');
const OUTPUT_JSON = path.join(__dirname, 'data', 'dashboard_data.json');

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\r') {
      // skip
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => cell !== ''));
}

function readCsvAsObjects(filename) {
  const raw = fs.readFileSync(path.join(SRC, filename), 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(raw);
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(cols => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] !== undefined ? cols[i].trim() : ''; });
    return obj;
  });
}

// ─── copied from assets/js/main.js — see file header note ──────────────────

function p4FormatDate(isoStr) {
  if (!isoStr || String(isoStr).trim() === '' || isoStr === '-') return '-';
  try {
    var s = String(isoStr).trim();
    var beYear = parseInt(s.substring(0, 4), 10);
    if (beYear > 2400) s = (beYear - 543) + s.substring(4);
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) { return String(isoStr); }
}

function p4GetNum(row, thaiKey, engKey) {
  if (Object.prototype.hasOwnProperty.call(row, thaiKey)) return Number(row[thaiKey]) || 0;
  if (engKey && Object.prototype.hasOwnProperty.call(row, engKey)) return Number(row[engKey]) || 0;
  return 0;
}

function p4GetText(row, thaiKey, engKey) {
  if (Object.prototype.hasOwnProperty.call(row, thaiKey)) return String(row[thaiKey] || '').trim();
  return String(row[engKey] || '').trim();
}

function p4SumThai(row, thaiKeys, engKey) {
  var hasAny = thaiKeys.some(function(k) { return Object.prototype.hasOwnProperty.call(row, k); });
  if (hasAny) return thaiKeys.reduce(function(sum, k) { return sum + (Number(row[k]) || 0); }, 0);
  return (engKey && Object.prototype.hasOwnProperty.call(row, engKey)) ? Number(row[engKey]) || 0 : 0;
}

var P4_YEARS = ['2566', '2567', '2568', '2569'];

function p4NormalizeDevices(rows) {
  var itemMap = {};

  rows.forEach(function(row) {
    var dist  = p4GetText(row, 'สถานที่_อำเภอ',                    'district');
    var unit  = p4GetText(row, 'หน่วยงาน_ที่ตั้งศูนย์ซ่อม',        'center_name');
    var cat   = p4GetText(row, 'กลุ่ม_อุปกรณ์ที่พร้อมให้บริการ',  'category');
    var equip = p4GetText(row, 'รายการ_อุปกรณ์',                   'item');
    var utype = p4GetText(row, 'อุปกรณ์_หน่วย',                    'unit');
    var key   = [dist, unit, cat, equip].join('\x00');

    if (!itemMap[key]) {
      itemMap[key] = { dist: dist, unit: unit, cat: cat, equip: equip, utype: utype, yr: {} };
    }

    var rawYears = {
      '2566': {
        buy:  p4GetNum(row, 'จัดซื้อ_ปี66',       'buy66'),
        paid: p4GetNum(row, 'เบิกจ่าย_ปี66',      'paid66'),
        bal:  p4GetNum(row, 'ยอดสุทธิ_ปี66(ห้ามแก้ไข)', 'balance66')
      },
      '2567': {
        buy:  p4GetNum(row, 'จัดซื้อ_ปี67',       'buy67'),
        paid: p4GetNum(row, 'เบิกจ่าย_ปี67',      'paid67'),
        bal:  p4GetNum(row, 'ยอดสุทธิ_ปี67(ห้ามแก้ไข)', 'balance67')
      },
      '2568': {
        buy:  p4SumThai(row, ['จัดซื้อ_ปี68_ระยะ1','จัดซื้อจากฟอร์ม_68_ร1',
                               'จัดซื้อ_ปี68_ระยะ2','จัดซื้อ_จากฟอร์ม_68_ร2'], 'buy68'),
        paid: p4SumThai(row, ['เบิกจ่าย_ปี68_ระยะ1','เบิกจ่าย_จากฟอร์ม_68_ร1',
                               'เบิกจ่าย_ปี68_ระยะ2','เบิกจ่าย_จากฟอร์ม_68_ร2'], 'paid68'),
        bal:  p4GetNum(row, 'ยอดสุทธิ_ปี68(ห้ามแก้ไข)', 'balance68')
      },
      '2569': {
        buy:  p4SumThai(row, ['จัดซื้อ_ปี69','จัดซื้อ_จากฟอร์ม_69'], 'buy69'),
        paid: p4SumThai(row, ['เบิกจ่าย_ปี69','เบิกจ่าย_จากฟอร์ม_69'], 'paid69'),
        bal:  p4GetNum(row, 'ยอดสุทธิ_ปี69(ห้ามแก้ไข)', 'balance69')
      }
    };

    P4_YEARS.forEach(function(y) {
      var d = rawYears[y];
      if (d.buy !== 0 || d.paid !== 0 || d.bal !== 0) {
        itemMap[key].yr[y] = d;
      }
    });
  });

  var data_by_year = {};

  Object.keys(itemMap).forEach(function(key) {
    var item = itemMap[key];
    var prevBal = 0;

    P4_YEARS.forEach(function(year) {
      var yd = item.yr[year];
      if (yd) {
        var effectiveBal = yd.bal > 0 ? yd.bal : Math.max(prevBal + yd.buy - yd.paid, 0);
        if (!data_by_year[year]) data_by_year[year] = [];
        data_by_year[year].push({
          district:     item.dist,
          unit:         item.unit,
          category:     item.cat,
          equipment:    item.equip,
          unit_type:    item.utype,
          year:         year,
          purchased:    yd.buy,
          used:         yd.paid,
          remaining:    effectiveBal,
          carryForward: false
        });
        prevBal = effectiveBal;
      } else if (prevBal > 0) {
        if (!data_by_year[year]) data_by_year[year] = [];
        data_by_year[year].push({
          district:     item.dist,
          unit:         item.unit,
          category:     item.cat,
          equipment:    item.equip,
          unit_type:    item.utype,
          year:         year,
          purchased:    0,
          used:         0,
          remaining:    prevBal,
          carryForward: true
        });
      }
    });
  });

  return data_by_year;
}

function p4NormalizeFunding(rows) {
  return rows.map(function(b) {
    var budgetRaw = String(b['งบประมาณ_จำนวนเงิน'] || b.budget || '');
    var budget = Number(budgetRaw.replace(/[^0-9.]/g, '')) || 0;
    return {
      year:      String(b['ปี_งบประมาณ']          || b.budget_year  || ''),
      unit:      String(b['ชื่อ_หน่วยงาน']          || b.agency        || ''),
      budget:    budget,
      submitted: p4FormatDate(b['วันที่_ส่งโครงการฯ'] || b.submit_date  || ''),
      approved:  p4FormatDate(b['วันที่_อนุมัติ']      || b.approve_date || ''),
      mou:       p4FormatDate(b['วันที่_ทำMOU']        || b.mou_date     || ''),
      received:  p4FormatDate(b['วันที่_รับเช็ค']       || b.check_date   || ''),
      reported:  p4FormatDate(b['วันที่_ส่งรายงานผล']  || b.report_date  || ''),
      notes:     String(b['หมายเหตุ'] || b.remark || '')
    };
  });
}

function p4BuildData(devicesRows, fundingRows) {
  var data_by_year = p4NormalizeDevices(devicesRows);
  var budgets      = p4NormalizeFunding(fundingRows);

  var budget_totals = {};
  budgets.forEach(function(b) {
    if (!b.year) return;
    budget_totals[b.year] = (budget_totals[b.year] || 0) + b.budget;
  });

  var yearSet = {};
  Object.keys(data_by_year).forEach(function(y) { yearSet[y] = true; });
  budgets.forEach(function(b) { if (b.year) yearSet[b.year] = true; });
  var available_years = Object.keys(yearSet).sort().reverse();

  var catSet = {};
  available_years.forEach(function(y) {
    (data_by_year[y] || []).forEach(function(r) { if (r.category) catSet[r.category] = true; });
  });
  var categories = Object.keys(catSet).sort();

  return {
    data_by_year:    data_by_year,
    budgets:         budgets,
    budget_totals:   budget_totals,
    available_years: available_years,
    categories:      categories
  };
}

// ─── end copied section ─────────────────────────────────────────────────────

function main() {
  const devicesRows = readCsvAsObjects('Project_4_data_device_repair - all_device_data.csv');
  const fundingRows = readCsvAsObjects('Project_4_data_device_repair - total_funding.csv');
  const output = p4BuildData(devicesRows, fundingRows);
  output.generatedAt = new Date().toISOString();

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  const totalRows = output.available_years.reduce((s, y) => s + (output.data_by_year[y] || []).length, 0);
  console.log('Wrote P4 data: ' + totalRows + ' device rows across ' + output.available_years.length
    + ' years, ' + output.budgets.length + ' funding rows -> ' + OUTPUT_JSON);
}

main();
