// Converts the P1 (ปรับสภาพบ้านฯ) source CSV into the ready-made data file
// index.html's P1 tab reads directly. Deliberately kept in the exact same
// shape (ok/project/projectName/updatedAt/summary/filters/charts/records,
// with records in personName/subdistrict/... field names) the old
// Google-connected version returned, so nothing else in index.html needs
// to change — see p1ApiRecordToLegacy, buildP1Summary_-equivalent code
// below, and gas/p1_api.gs (kept for reference, no longer called).
//
// Privacy, on purpose, not a bug:
//   - personName is always half-masked ("นายน***"), never in full — there
//     is no "full data" version of this file anywhere.
//   - The house-number column (ที่อยู่_บ้านเลขที่) is never read into the
//     output at all — only subdistrict and district go out.
//   - Anyone who needs the complete real record should contact the
//     relevant service unit (see agency) directly, not look it up here.
//
// Usage: node generate_data.js — re-run whenever a new source CSV/xlsx
// arrives from the Fund.

const fs = require('fs');
const path = require('path');

const SOURCE_CSV = path.join(__dirname, 'source', 'Project_1_data_home_improvement - all_house.csv');
const OUTPUT_JSON = path.join(__dirname, 'data', 'dashboard_data.json');

const DISABILITY_COLUMNS = {
  'ความพิการ_ทางการเห็น(ป.1)': 'ทางการเห็น',
  'ความพิการ_ทางการได้ยินหรือสื่อความหมาย(ป.2)': 'ทางการได้ยินหรือสื่อความหมาย',
  'ความพิการ_ทางการเคลื่อนไหวหรือทางร่างกาย(ป.3)': 'ทางการเคลื่อนไหวหรือทางร่างกาย',
  'ความพิการ_ทางจิตใจหรือพฤติกรรม(ป.4)': 'ทางจิตใจหรือพฤติกรรม',
  'ความพิการ_ทางสติปัญญา(ป.5)': 'ทางสติปัญญา',
  'ความพิการ_ทางการเรียนรู้(ป.6)': 'ทางการเรียนรู้',
  'ความพิการ_ทางออทิสติก(ป.7)': 'ทางออทิสติก'
};

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

// "นายนารี รื่นรมย์" -> "นายน*** ร***": each space-separated part keeps
// its first half (rounded up), the rest becomes a fixed "***".
function maskNamePart(part) {
  const chars = String(part || '').split('');
  if (chars.length === 0) return '';
  const visible = Math.max(1, Math.ceil(chars.length / 2));
  return chars.slice(0, visible).join('') + '***';
}

function maskName(name) {
  return String(name || '').split(' ').filter(Boolean).map(maskNamePart).join(' ');
}

function unique(arr) {
  return [...new Set(arr.map(v => String(v).trim()).filter(Boolean))];
}

function buildSummary(records) {
  const totalRecords = records.length;
  const completed = records.filter(r => r.projectStatus === 'แล้วเสร็จ').length;
  const inProgress = records.filter(r => r.projectStatus === 'กำลังดำเนินการ').length;
  const totalBudget = records.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);
  const districts = unique(records.map(r => r.district));
  const agencies = unique(records.map(r => r.agency));
  return {
    totalRecords, completed, inProgress, totalBudget,
    districtCount: districts.length,
    agencyCount: agencies.length,
    averageBudgetPerRecord: totalRecords ? Math.round(totalBudget / totalRecords) : 0
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
    byYear[year].budget += Number(r.budget) || 0;
    byYear[year].count += 1;
    if (r.district) byDistrict[r.district] = (byDistrict[r.district] || 0) + 1;
    if (r.statusGroup) byType[r.statusGroup] = (byType[r.statusGroup] || 0) + 1;
    (r.disabilityTypes || []).forEach(d => { if (d) byDisability[d] = (byDisability[d] || 0) + 1; });
    const age = Number(r.age) || 0;
    if (age < 20) byAge[0]++;
    else if (age < 40) byAge[1]++;
    else if (age < 60) byAge[2]++;
    else if (age < 80) byAge[3]++;
    else byAge[4]++;
  });
  return { byYear, byDistrict, byType, byDisability, byAge };
}

function main() {
  const raw = fs.readFileSync(SOURCE_CSV, 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(raw);
  const headers = rows[0].map(h => h.trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const records = rows.slice(1).map(cols => {
    const disabilityTypes = [];
    Object.keys(DISABILITY_COLUMNS).forEach(col => {
      if (idx[col] !== undefined && String(cols[idx[col]] || '').trim()) {
        disabilityTypes.push(DISABILITY_COLUMNS[col]);
      }
    });

    return {
      personName: maskName((cols[idx['ชื่อ_ผู้รับงบประมาณ']] || '').trim()),
      age: Number(cols[idx['อายุ_ปี']]) || 0,
      statusGroup: (cols[idx['สถานะภาพ']] || '').trim(),
      subdistrict: (cols[idx['ที่อยู่_ตำบล']] || '').trim(),
      district: (cols[idx['ที่อยู่_อำเภอ']] || '').trim(),
      budget: Number(String(cols[idx['งบประมาณ']] || '0').replace(/[^\d.-]/g, '')) || 0,
      sourceYearLabel: (cols[idx['ปี_งบประมาณ']] || '').trim(),
      projectStatus: (cols[idx['สถานะ_โครงการ']] || '').trim(),
      disabilityTypes: disabilityTypes,
      agency: (cols[idx['ชื่อ_หน่วยงาน']] || '').trim()
    };
  }).filter(r => r.personName || r.subdistrict || r.district);

  const output = {
    ok: true,
    project: 'P1',
    projectName: 'โครงการปรับสภาพแวดล้อมที่อยู่อาศัยสำหรับคนพิการ ผู้สูงอายุ ผู้ป่วยที่อยู่ในระยะกึ่งเฉียบพลันและผู้ที่มีภาวะพึ่งพิง',
    updatedAt: new Date().toISOString(),
    summary: buildSummary(records),
    filters: buildFilters(records),
    charts: buildChartAggregates(records),
    records: records
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote ' + records.length + ' P1 records (names half-masked, no house address) to ' + OUTPUT_JSON);
}

main();
