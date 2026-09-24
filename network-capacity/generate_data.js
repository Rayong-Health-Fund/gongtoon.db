// Converts the P3 (เครือข่ายบริการ/พัฒนาศักยภาพฯ) source CSV into the same
// {y,d,u,b,n,s} record shape gas/p3_api.gs's getP3Records_ returns, so
// index.html's P3 tab can read this static file instead of waiting on a
// live Apps Script round trip for the public read-only view.
//
// Usage: node generate_data.js
// Re-run this whenever a new source CSV/xlsx arrives from the Fund.

const fs = require('fs');
const path = require('path');

const SOURCE_CSV = path.join(__dirname, 'source', 'Project_3_data_network_capacity - all_network_data.csv');
const OUTPUT_JSON = path.join(__dirname, 'data', 'dashboard_data.json');

const STATUS_LABELS = {
  completed: 'เสร็จเรียบร้อย',
  in_progress: 'อยู่ระหว่างดำเนินการ'
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

function main() {
  const raw = fs.readFileSync(SOURCE_CSV, 'utf8').replace(/^﻿/, '');
  const rows = parseCsv(raw);
  const headers = rows[0].map(h => h.trim());
  const idx = {};
  headers.forEach((h, i) => { idx[h] = i; });

  const records = rows.slice(1).map(cols => {
    const statusRaw = String(cols[idx['สถานะ_รายงานผล']] || '').trim();
    return {
      y: Number(cols[idx['ปี_งบประมาณ']]) || cols[idx['ปี_งบประมาณ']],
      d: (cols[idx['ชื่อ_อำเภอ']] || '').trim(),
      u: (cols[idx['ชื่อ_หน่อยบริการ']] || '').trim(),
      b: Number(String(cols[idx['จำนวนเงิน']] || '0').replace(/[^\d.-]/g, '')) || 0,
      n: (cols[idx['ชื่อ_โครงการ']] || '').trim(),
      s: STATUS_LABELS[statusRaw] || statusRaw
    };
  }).filter(r => r.d || r.u || r.n);

  fs.mkdirSync(path.dirname(OUTPUT_JSON), { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify({ ok: true, project: 'P3', generatedAt: new Date().toISOString(), records }, null, 2), 'utf8');
  console.log('Wrote ' + records.length + ' P3 records to ' + OUTPUT_JSON);
}

main();
