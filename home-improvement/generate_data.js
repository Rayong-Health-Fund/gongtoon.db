// Builds the data file index.html's P1 tab (ปรับสภาพบ้านฯ) reads, straight
// from the Fund's own report "เอกสารแนบ 6 รายงานปรับสภาพบ้าน.xlsx" — the
// same file presented at the committee meeting, so the website and the
// meeting always show the same numbers.
//
// Output keeps the shape the page already expects (ok/project/projectName/
// updatedAt/summary/filters/charts/records), with one deliberate change:
// เอกสารแนบ 6 lists each house by service unit (หน่วยงาน), not by person,
// so records carry the unit in `agency`/`subdistrict` and personName is
// always empty. No names or house addresses exist anywhere in this file.
//
// Project status isn't in เอกสารแนบ 6. The Fund confirmed (Oct 2569) every
// house in the FY2569 report is finished and fully reported, so all are
// "แล้วเสร็จ". If a future report includes unfinished houses, change
// PROJECT_STATUS handling here.
const PROJECT_STATUS = 'แล้วเสร็จ';
//
// Usage: npm run data:p1  (re-run whenever a new เอกสารแนบ 6 arrives)

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOURCE_XLSX = path.join(__dirname, 'source', 'เอกสารแนบ 6 รายงานปรับสภาพบ้าน.xlsx');
const OUTPUT_JSON = path.join(__dirname, 'data', 'dashboard_data.json');

const DISABILITY_CODES = {
  'ป.1': 'ทางการเห็น',
  'ป.2': 'ทางการได้ยินหรือสื่อความหมาย',
  'ป.3': 'ทางการเคลื่อนไหวหรือทางร่างกาย',
  'ป.4': 'ทางจิตใจหรือพฤติกรรม',
  'ป.5': 'ทางสติปัญญา',
  'ป.6': 'ทางการเรียนรู้',
  'ป.7': 'ทางออทิสติก'
};

// Long agency prefixes -> the short forms used everywhere else on the site.
const AGENCY_PREFIXES = [
  ['องค์การบริหารส่วนตำบล', 'อบต.'],
  ['เทศบาลนคร', 'ทน.'],
  ['เทศบาลเมือง', 'ทม.'],
  ['เทศบาลตำบล', 'ทต.']
];

function text(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function ticked(v) { return /[√✓✔]/.test(String(v || '')); }

function shortAgency(name) {
  name = text(name);
  for (const [long, short] of AGENCY_PREFIXES) {
    if (name.indexOf(long) === 0) return short + name.slice(long.length).trim();
  }
  return name;
}

// "อำเภอเมืองระยอง" -> "เมือง" (the P1 tab's existing district naming).
function districtName(header) {
  const d = text(header).replace(/^อำเภอ/, '');
  return d === 'เมืองระยอง' ? 'เมือง' : d;
}

function statusGroup(flags) {
  if (flags.disabled && flags.elderly) return 'ผู้สูงอายุ/ผู้พิการ';
  if (flags.disabled) return 'ผู้พิการ';
  if (flags.elderly) return 'ผู้สูงอายุ';
  if (flags.imc) return 'ผู้ป่วยระยะกึ่งเฉียบพลัน (IMC)';
  if (flags.palliative) return 'ผู้ป่วยระยะท้าย (Palliative Care)';
  if (flags.dependent) return 'ผู้ที่มีภาวะพึ่งพิง';
  return 'ไม่ระบุ';
}

function readRecords(wb) {
  const ws = wb.Sheets['รายละเอียด'];
  if (!ws) throw new Error('sheet "รายละเอียด" not found in ' + SOURCE_XLSX);
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  const records = [];
  const subtotals = {}; // district -> budget printed on the district's subtotal row
  let district = '';
  rows.forEach(r => {
    const a = text(r[0]);
    if (/^อำเภอ/.test(a) && !text(r[1])) { district = districtName(a); return; }
    if (/^สนับสนุนงบประมาณ/.test(a)) { subtotals[district] = Number(r[9]) || 0; return; }
    if (!/^\d+$/.test(a) || !text(r[1])) return;

    const flags = {
      disabled: ticked(r[4]), elderly: ticked(r[5]), imc: ticked(r[6]),
      palliative: ticked(r[7]), dependent: ticked(r[8])
    };
    const codes = text(r[10]).match(/ป\.\s*\d/g) || [];
    const agency = shortAgency(r[1]);
    records.push({
      personName: '',
      age: Number(r[3]) || 0,
      statusGroup: statusGroup(flags),
      subdistrict: agency,
      district: district,
      budget: Math.round((Number(r[9]) || 0) * 100) / 100,
      sourceYearLabel: text(r[2]).replace(/\s*-\s*/g, '-'),
      projectStatus: '',
      disabilityTypes: [...new Set(codes.map(c => DISABILITY_CODES[c.replace(/\s/g, '')]).filter(Boolean))],
      agency: agency
    });
  });

  records.forEach(r => { r.projectStatus = PROJECT_STATUS; });
  return { records, subtotals };
}

// "ภาพรวม" sheet: the district totals the meeting sees. Used only to
// cross-check the detail rows, so a typo in either is caught here.
function readOverview(wb) {
  const ws = wb.Sheets['ภาพรวม'];
  if (!ws) return null;
  const out = {};
  XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }).forEach(r => {
    if (/^\d+$/.test(text(r[0])) && text(r[1])) {
      out[districtName(r[1])] = { years: text(r[2]), count: Number(r[3]) || 0, budget: Number(r[4]) || 0 };
    }
  });
  return out;
}

function unique(arr) {
  return [...new Set(arr.map(v => String(v).trim()).filter(Boolean))];
}

function buildSummary(records) {
  const totalBudget = records.reduce((sum, r) => sum + r.budget, 0);
  return {
    totalRecords: records.length,
    completed: records.filter(r => r.projectStatus === 'แล้วเสร็จ').length,
    inProgress: records.filter(r => r.projectStatus === 'กำลังดำเนินการ').length,
    totalBudget: Math.round(totalBudget * 100) / 100,
    districtCount: unique(records.map(r => r.district)).length,
    agencyCount: unique(records.map(r => r.agency)).length,
    averageBudgetPerRecord: records.length ? Math.round(totalBudget / records.length) : 0
  };
}

function buildFilters(records) {
  return {
    years: unique(records.map(r => r.sourceYearLabel)),
    districts: unique(records.map(r => r.district)),
    subdistricts: unique(records.map(r => r.subdistrict)),
    agencies: unique(records.map(r => r.agency)),
    statuses: unique(records.map(r => r.projectStatus)),
    statusGroups: unique(records.map(r => r.statusGroup)),
    disabilityCodes: []
  };
}

function buildChartAggregates(records) {
  const byYear = {}, byDistrict = {}, byType = {}, byDisability = {};
  const byAge = [0, 0, 0, 0, 0];
  records.forEach(r => {
    const year = r.sourceYearLabel || '—';
    if (!byYear[year]) byYear[year] = { budget: 0, count: 0 };
    byYear[year].budget += r.budget;
    byYear[year].count += 1;
    byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
    byType[r.statusGroup] = (byType[r.statusGroup] || 0) + 1;
    r.disabilityTypes.forEach(d => { byDisability[d] = (byDisability[d] || 0) + 1; });
    const age = r.age;
    if (age < 20) byAge[0]++;
    else if (age < 40) byAge[1]++;
    else if (age < 60) byAge[2]++;
    else if (age < 80) byAge[3]++;
    else byAge[4]++;
  });
  return { byYear, byDistrict, byType, byDisability, byAge };
}

function crossCheck(records, subtotals, overview) {
  const warnings = [];
  const byDistrict = {};
  records.forEach(r => {
    const d = byDistrict[r.district] || (byDistrict[r.district] = { count: 0, budget: 0 });
    d.count++; d.budget += r.budget;
  });
  Object.keys(byDistrict).forEach(d => {
    const got = byDistrict[d];
    if (subtotals[d] !== undefined && Math.abs(subtotals[d] - got.budget) > 1) {
      warnings.push(d + ': detail rows sum to ' + got.budget.toFixed(2) + ' but subtotal row says ' + subtotals[d]);
    }
    const o = overview && overview[d];
    if (o && (o.count !== got.count || Math.abs(o.budget - got.budget) > 1)) {
      warnings.push(d + ': detail = ' + got.count + ' houses / ' + got.budget.toFixed(2)
        + ', ภาพรวม sheet = ' + o.count + ' / ' + o.budget);
    }
  });
  return warnings;
}

function main() {
  const wb = XLSX.readFile(SOURCE_XLSX);
  const { records, subtotals } = readRecords(wb);
  const overview = readOverview(wb);
  const warnings = crossCheck(records, subtotals, overview);

  const output = {
    ok: true,
    project: 'P1',
    projectName: 'โครงการปรับสภาพแวดล้อมที่อยู่อาศัยสำหรับคนพิการ ผู้สูงอายุ ผู้ป่วยที่อยู่ในระยะกึ่งเฉียบพลันและผู้ที่มีภาวะพึ่งพิง',
    source: path.basename(SOURCE_XLSX),
    updatedAt: new Date().toISOString(),
    summary: buildSummary(records),
    overview: overview,
    filters: buildFilters(records),
    charts: buildChartAggregates(records),
    records: records
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log('P1: ' + records.length + ' houses, ' + output.summary.totalBudget.toLocaleString() + ' บาท -> ' + OUTPUT_JSON);
  warnings.forEach(w => console.warn('  ! ' + w));
}

main();
