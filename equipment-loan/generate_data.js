// Converts the P2 (ศูนย์สาธิตและยืมอุปกรณ์) source CSVs into the ready-made
// data file index.html's P2 tab reads directly. Kept in the exact same
// shape (equipment/map/ref_equipment rows, English field names like
// available_qty/borrowed_qty/...) the old Google-connected version
// returned from ?type=equipment|map|ref_equipment, so buildP2DatasetsFromApi
// in index.html needs no changes at all — just where the rows come from.
//
// Privacy, on purpose, not a bug: the raw source CSV has a borrower-name
// and national-ID-card column per item — those are never read into the
// output at all. The Fund was never supposed to track individual borrower
// identity in the first place (see entry-form-project2.html's own note),
// so this isn't a masked version, it's just left out completely.
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

function readCsv(filename) {
  const raw = fs.readFileSync(path.join(SRC, filename), 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(raw);
  const headers = rows[0].map(h => h.trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });
  return { idx, dataRows: rows.slice(1) };
}

function toNumber(value) {
  return Number(String(value || '0').replace(/[^\d.-]/g, '')) || 0;
}

// ── equipment: one row per physical item -> aggregated per (district,
//    agency, equipment) counts, same shape the live sheet used to have ──
function buildEquipmentRows() {
  const { idx, dataRows } = readCsv('Project_2_data_equipment_loan - all_equipment_data.csv');
  const groups = {};
  const order = [];

  dataRows.forEach(cols => {
    const district = (cols[idx['ชื่อ_อำเภอ']] || '').trim();
    const agency = (cols[idx['ชื่อ_หน่วยงาน']] || '').trim();
    const equipment_name = (cols[idx['รายการ_อุปกรณ์_(ชิ้น)']] || '').trim();
    const year = (cols[idx['ปี_งบประมาณ']] || '').trim();
    const status = (cols[idx['สถานะ_อุปกรณ์']] || '').trim();
    if (!agency || !equipment_name) return;

    const key = district + '||' + agency + '||' + equipment_name;
    if (!groups[key]) {
      groups[key] = {
        district, agency, equipment_name,
        available_qty: 0, active_qty: 0, damaged_qty: 0, borrowed_qty: 0,
        total_supported_qty: 0
      };
      order.push(key);
    }
    const g = groups[key];

    if (status === 'พร้อม') g.available_qty++;
    else if (status === 'ใช้งานอยู่') g.active_qty++;
    else if (status === 'ชำรุด') g.damaged_qty++;
    else if (status === 'ยืม') g.borrowed_qty++;

    if (/^\d{4}$/.test(year)) {
      const field = 'budget_' + year;
      g[field] = (g[field] || 0) + 1;
    }
  });

  return order.map(k => groups[k]);
}

function buildMapRows() {
  const { idx, dataRows } = readCsv('Project_2_data_equipment_loan - all_map_destination.csv');
  return dataRows.map(cols => ({
    agency_type: (cols[idx['ประเภท_หน่วยงาน']] || '').trim(),
    agency: (cols[idx['ชื่อ_หน่วยงาน']] || '').trim(),
    subdistrict: (cols[idx['ชื่อ_ตำบล']] || '').trim(),
    district: (cols[idx['ชื่อ_อำเภอ']] || '').trim(),
    phone: (cols[idx['เบอร์โทร']] || '').trim(),
    google_map_link: (cols[idx['link_google_map']] || '').trim()
  })).filter(r => r.agency);
}

function buildRefEquipmentRows() {
  const { idx, dataRows } = readCsv('Project_2_data_equipment_loan - ref_sheet_equip_list.csv');
  return dataRows.map(cols => ({
    equipment_no: (cols[idx['รหัส_อุปกรณ์']] || '').trim(),
    equipment_name: (cols[idx['รายการ']] || '').trim().replace(/_/g, ' ')
  })).filter(r => r.equipment_name);
}

function buildFundingRows() {
  const { idx, dataRows } = readCsv('Project_2_data_equipment_loan - all_funding_list.csv');
  return dataRows.map(cols => ({
    district: (cols[idx['ชื่อ_อำเภอ']] || '').trim(),
    agency: (cols[idx['ชื่อ_หน่วยงาน']] || '').trim(),
    budget_2564: toNumber(cols[idx['งบประมาณ_ปี_2564']]),
    budget_2565: toNumber(cols[idx['งบประมาณ_ปี_2565']]),
    budget_2566: toNumber(cols[idx['งบประมาณ_ปี_2566']]),
    budget_2567: toNumber(cols[idx['งบประมาณ_ปี_2567']]),
    budget_2568: toNumber(cols[idx['งบประมาณ_ปี_2568']])
  })).filter(r => r.agency);
}

function main() {
  const output = {
    ok: true,
    project: 'P2',
    generatedAt: new Date().toISOString(),
    equipment: buildEquipmentRows(),
    map: buildMapRows(),
    ref_equipment: buildRefEquipmentRows(),
    funding: buildFundingRows()
  };

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(output, null, 2), 'utf8');
  console.log('Wrote P2 data: ' + output.equipment.length + ' equipment groups, '
    + output.map.length + ' map entries, ' + output.ref_equipment.length + ' equipment types, '
    + output.funding.length + ' funding rows -> ' + OUTPUT_JSON);
}

main();
