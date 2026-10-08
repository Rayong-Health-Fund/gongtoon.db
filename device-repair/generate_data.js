// Builds the data file index.html's P4 tab (ศูนย์ซ่อมบำรุงฯ) reads, in the
// project4Data shape the page already expects (data_by_year/budgets/
// budget_totals/available_years/categories), plus `units` and `repairs`.
//
// Sources:
//   1. "เอกสารแนบ 5 รายงานศูนย์ซ่อม.xlsx" — the report presented at the
//      committee meeting. Each unit's district and total budget (net of any
//      money returned to the Fund) come from here, and the totals on the
//      site must match it.
//   2. "สรุป โครงการศูนย์ซ่อมฯ เกี่ยวกับการขอรับงบฯ และเข้าแผนปี 2570.xlsx",
//      sheet "สรุป 1" — one row per unit per fiscal year with the approved
//      amount, process dates and notes. Refunds written in the notes
//      ("คืนเงิน 12,109.-") are subtracted, which is how เอกสารแนบ 5 gets
//      its net figures; the script checks the two agree.
//   3. "ข้อมูลเบิกจ่ายของแต่ละหน่วยบริการ อัพเดท กันยายน 2569/*.xlsx" — one
//      workbook per unit: spare parts bought / used per year, and how many
//      wheelchairs / beds / mattresses were repaired.
//
// Usage: npm run data:p4  (re-run whenever new reports arrive)

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SRC = path.join(__dirname, 'source');
const REPORT_XLSX = path.join(SRC, 'เอกสารแนบ 5 รายงานศูนย์ซ่อม.xlsx');
const FUNDING_XLSX = path.join(SRC, 'สรุป โครงการศูนย์ซ่อมฯ เกี่ยวกับการขอรับงบฯ และเข้าแผนปี 2570.xlsx');
const DISBURSE_DIR = path.join(SRC, 'ข้อมูลเบิกจ่ายของแต่ละหน่วยบริการ อัพเดท กันยายน 2569');
const OUTPUT_JSON = path.join(__dirname, 'data', 'dashboard_data.json');

const PREFIXES = [
  ['องค์การบริหารส่วนตำบล', 'อบต.'],
  ['เทศบาลตำบล', 'ทต.'],
  ['เทศบาลเมือง', 'ทม.'],
  ['โรงพยาบาล', 'รพ.']
];
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function text(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
// Handles plain numbers and the Fund's "497,500.-" money style.
function num(v) {
  if (typeof v === 'number') return v;
  const m = String(v == null ? '' : v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}
function rowsOf(ws) { return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }); }
function round2(n) { return Math.round(n * 100) / 100; }

function fullName(name) {
  name = text(name);
  for (const [long, short] of PREFIXES) {
    if (name.indexOf(short) === 0) return long + name.slice(short.length);
  }
  return name;
}

// The Fund types dates as d/m/yy with a Buddhist-era year, which Excel
// stores either as 19yy (two-digit year) or as a 25xx "Gregorian" year.
// Either way the Buddhist-era year is recoverable.
function thaiDate(v) {
  if (typeof v !== 'number' || v < 1000) return text(v) || '-';
  const d = XLSX.SSF.parse_date_code(v);
  if (!d) return '-';
  const be = d.y > 2400 ? d.y : d.y < 2000 ? 2500 + (d.y - 1900) : d.y + 543;
  return d.d + ' ' + THAI_MONTHS[d.m - 1] + ' ' + be;
}

// ── 1. เอกสารแนบ 5: unit -> district + net total ────────────────────────
function readReport() {
  const rows = rowsOf(XLSX.readFile(REPORT_XLSX).Sheets['Sheet1']);
  const units = [];
  let district = '';
  rows.forEach(r => {
    if (text(r[1]) && text(r[1]) !== 'อำเภอ') district = text(r[1]);
    const unit = text(r[2]);
    if (!unit || unit === 'หน่วยงาน' || !num(r[7])) return;
    units.push({ unit: fullName(unit), short: unit, district, budget: num(r[7]) });
  });
  return units;
}

// ── 2. สรุป 1: one row per unit per year ────────────────────────────────
function readFunding() {
  const rows = rowsOf(XLSX.readFile(FUNDING_XLSX).Sheets['สรุป 1']);
  const out = [];
  let year = '';
  rows.forEach(r => {
    const y = text(r[0]).match(/^ปีงบประมาณ\s*(25\d\d)/);
    if (y) { year = y[1]; return; }
    if (!/^\d+$/.test(text(r[0])) || !text(r[1])) return;
    const approved = num(r[5]);
    const notes = text(r[8]);
    const refund = num((notes.match(/คืนเงิน\s*([\d,.]+)/) || [])[1]);
    out.push({
      year,
      unit: fullName(r[1]),
      approved,
      refund,
      budget: approved ? round2(approved - refund) : 0,
      submitted: thaiDate(r[2]),
      approved_date: thaiDate(r[3]),
      mou: thaiDate(r[4]),
      received: thaiDate(r[6]),
      reported: thaiDate(r[7]),
      notes
    });
  });
  return out;
}

// ── 3. per-unit disbursement workbooks ──────────────────────────────────
function readDisbursements(districtOf, warnings) {
  const items = [];
  const repairs = [];
  fs.readdirSync(DISBURSE_DIR).filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$')).forEach(file => {
    const wb = XLSX.readFile(path.join(DISBURSE_DIR, file));
    const rows = rowsOf(wb.Sheets[wb.SheetNames[0]]);
    // Row 3 of each workbook spells the unit inconsistently (blank on one,
    // "เทศบาลเมือง" for a ทต. on another); the file name is reliable.
    const fromName = file.replace(/\s*ok\.xlsx$/i, '').match(/(อบต\.|ทต\.|ทม\.|รพ\.)\S+$/);
    const unit = fullName(fromName ? fromName[0] : (rows[2] && (rows[2][0] || rows[2][1])));
    const district = districtOf[unit] || '';
    if (!district) warnings.push(file + ': unit "' + unit + '" not found in เอกสารแนบ 5');

    let category = '', years = [], summaryYears = null, summaryCat = '';
    const yearOf = v => (text(v).match(/^(25\d\d)/) || [])[1];
    rows.forEach(r => {
      const a = text(r[0]);
      if (/^กลุ่ม/.test(a) && !text(r[2])) { category = a.replace(/^กลุ่ม/, ''); summaryYears = null; return; }
      // year header under "จำนวนที่ซื้อ": [ '', '', '', 2567, '2568 (1)', '2568 (2)', 2569, 2567, ... ]
      // — a year appears twice when it had two funding rounds (ระยะ 1/2).
      if (!a && !text(r[1]) && yearOf(r[3])) {
        const ys = r.slice(3).map(yearOf).filter(Boolean);
        years = ys.slice(0, ys.length / 2);
        return;
      }
      if (/^สรุปเบิกจ่าย/.test(a)) {
        summaryYears = r.slice(3).map(yearOf).filter(Boolean);
        summaryCat = (a.match(/กลุ่ม(.+)$/) || [])[1] || '';
        return;
      }
      // repaired-device count: "กลุ่มรถวีลแชร์ | | คัน | 30 | 20 | ..." or, when
      // the group is named in the header row instead, " | | คัน | ...".
      if (summaryYears && text(r[2]) && !text(r[1]) && (/^กลุ่ม/.test(a) || (!a && summaryCat))) {
        const byYear = {};
        summaryYears.forEach((y, k) => { byYear[y] = (byYear[y] || 0) + num(r[3 + k]); });
        repairs.push({ district, unit, category: a ? a.replace(/^กลุ่ม/, '') : summaryCat.trim(),
                       unit_type: text(r[2]), by_year: byYear, total: num(r[3 + summaryYears.length]) });
        summaryCat = '';
        return;
      }
      if (!/^\d+$/.test(a) || !text(r[1]) || !years.length) return;
      const n = years.length;
      const yr = {};
      years.forEach((y, k) => {
        const d = yr[y] || (yr[y] = { buy: 0, paid: 0 });
        d.buy += num(r[3 + k]);
        d.paid += num(r[3 + n + k]);
      });
      items.push({ dist: district, unit, cat: category, equip: text(r[1]), utype: text(r[2]),
                   yr, remainingInFile: num(r[3 + 2 * n]), file });
    });
  });
  return { items, repairs };
}

// Same per-year row shape (incl. carry-forward rows for years with no
// movement) the page's P4 code was written against.
function buildDataByYear(items, warnings) {
  const allYears = [...new Set(items.flatMap(it => Object.keys(it.yr)))].sort();
  const data_by_year = {};
  items.forEach(it => {
    let bal = 0, started = false;
    allYears.forEach(year => {
      const yd = it.yr[year];
      const moved = yd && (yd.buy || yd.paid);
      if (moved) {
        bal = round2(Math.max(bal + yd.buy - yd.paid, 0));
        started = true;
      }
      if (!started || (!moved && bal <= 0)) return;
      (data_by_year[year] = data_by_year[year] || []).push({
        district: it.dist, unit: it.unit, category: it.cat, equipment: it.equip, unit_type: it.utype,
        year, purchased: moved ? yd.buy : 0, used: moved ? yd.paid : 0, remaining: bal, carryForward: !moved
      });
    });
    if (Math.abs(bal - it.remainingInFile) > 0.01) {
      warnings.push(it.file + ': ' + it.equip + ' remaining computed ' + bal + ', file says ' + it.remainingInFile);
    }
  });
  return data_by_year;
}

function main() {
  const warnings = [];
  const units = readReport();
  const districtOf = {};
  units.forEach(u => { districtOf[u.unit] = u.district; });

  const funding = readFunding();
  funding.forEach(b => { b.district = districtOf[b.unit] || ''; });
  units.forEach(u => {
    const sum = round2(funding.filter(b => b.unit === u.unit).reduce((a, b) => a + b.budget, 0));
    u.years = [...new Set(funding.filter(b => b.unit === u.unit && b.budget > 0).map(b => b.year))];
    if (Math.abs(sum - u.budget) > 1) {
      warnings.push(u.short + ': สรุป 1 (net of refunds) = ' + sum + ', เอกสารแนบ 5 = ' + u.budget);
    }
  });

  const { items, repairs } = readDisbursements(districtOf, warnings);
  const data_by_year = buildDataByYear(items, warnings);

  const budget_totals = {};
  funding.forEach(b => { budget_totals[b.year] = round2((budget_totals[b.year] || 0) + b.budget); });
  const available_years = [...new Set([...Object.keys(data_by_year), ...Object.keys(budget_totals)])].sort().reverse();
  const categories = [...new Set(items.map(it => it.cat).filter(Boolean))].sort();

  const output = {
    source: path.basename(REPORT_XLSX),
    data_by_year,
    budgets: funding.map(b => ({
      year: b.year, unit: b.unit, district: b.district, budget: b.budget, approved_amount: b.approved,
      refund: b.refund, submitted: b.submitted, approved: b.approved_date, mou: b.mou,
      received: b.received, reported: b.reported, notes: b.notes
    })),
    budget_totals,
    available_years,
    categories,
    units: units.map(u => ({ unit: u.unit, short: u.short, district: u.district, budget: u.budget, years: u.years })),
    repairs,
    generatedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  const total = units.reduce((a, u) => a + u.budget, 0);
  const rowCount = Object.values(data_by_year).reduce((a, r) => a + r.length, 0);
  console.log('P4: ' + units.length + ' units, ' + total.toLocaleString() + ' บาท, ' + items.length
    + ' spare-part items (' + rowCount + ' year rows), ' + repairs.length + ' repair summaries -> ' + OUTPUT_JSON);
  warnings.forEach(w => console.warn('  ! ' + w));
}

main();
