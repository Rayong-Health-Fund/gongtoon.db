// ============================================================
// Project 2 — Migration tool (bound to the P2 Google Sheet)
// ============================================================
// Rebuilds the P2_MASTER_* tabs from the raw per-district
// "อ.xxx" / "งบ อ.xxx" sheets and the reference sheets. Run
// runP2Migration() from the Apps Script editor (or its custom
// menu) whenever the raw district sheets are updated.
//
// This is NOT the public API — it only writes into this
// spreadsheet. The doGet() Web App that serves the website is
// a separate script file (see p2_api.gs).
// ============================================================

const P2_CONFIG = {
  refEquipmentSheet: 'รายการอุปกรณ์',
  mapSourceSheet: 'แผนที่หน่วยงานศูนย์สาธิต',

  masterEquipment: 'P2_MASTER_EQUIPMENT_LOAN',
  masterFunding: 'P2_MASTER_FUNDING',
  masterMap: 'P2_MASTER_MAP_DESTINATION',
  masterRefEquipment: 'P2_REF_EQUIPMENT',

  equipmentDistrictSheets: [
    'อ.เมืองระยอง',
    'อ.นิคม',
    'อ.บ้านฉาง',
    'อ.แกลง',
    'อ.วังจันทร์',
    'อ.บ้านค่าย',
    'อ.ปลวกแดง',
    'อ.เขาชะเมา'
  ],

  fundingDistrictSheets: [
    'งบ อ.เมืองระยอง',
    'งบ อ.นิคม',
    'งบ อ.บ้านฉาง',
    'งบ อ.แกลง',
    'งบ อ.วังจันทร์',
    'งบ อ.บ้านค่าย',
    'งบ อ.ปลวกแดง',
    'งบ อ.เขาชะเมา'
  ]
};

function runP2Migration() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  migrateP2RefEquipment_(ss);
  migrateP2EquipmentLoan_(ss);
  migrateP2Funding_(ss);
  migrateP2MapDestination_(ss);

  SpreadsheetApp.getUi().alert('P2 Migration สำเร็จแล้ว');
}

function migrateP2RefEquipment_(ss) {
  const source = ss.getSheetByName(P2_CONFIG.refEquipmentSheet);
  const target = getOrCreateSheet_(ss, P2_CONFIG.masterRefEquipment);

  const headers = ['equipment_no', 'equipment_name', 'updated_at'];
  resetSheet_(target, headers);

  if (!source) return;

  const values = source.getDataRange().getValues();
  const headerMap = getHeaderMap_(values[0]);
  const rows = [];
  const now = new Date();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const no = getByHeaders_(row, headerMap, ['ลำดับ']);
    const name = getByHeaders_(row, headerMap, ['รายการ']);

    if (!name) continue;
    rows.push([no, name, now]);
  }

  appendRows_(target, rows);
}

function migrateP2EquipmentLoan_(ss) {
  const target = getOrCreateSheet_(ss, P2_CONFIG.masterEquipment);

  const headers = [
    'source_sheet',
    'source_row',
    'district',
    'agency',
    'equipment_name',
    'budget_2564',
    'budget_2565',
    'budget_2566',
    'budget_2567',
    'budget_2568',
    'budget_2569',
    'budget_2570',
    'total_supported_qty',
    'borrowed_qty',
    'damaged_qty',
    'available_qty',
    'active_qty',
    'updated_at'
  ];

  resetSheet_(target, headers);

  const rows = [];
  const now = new Date();

  P2_CONFIG.equipmentDistrictSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headerMap = getHeaderMap_(values[0]);
    const district = normalizeDistrictName_(sheetName);

    for (let i = 1; i < values.length; i++) {
      const row = values[i];

      const agency = getByHeaders_(row, headerMap, ['หน่วยงาน', 'ชื่อหน่วยงาน', 'ชื่อ_หน่วยงาน']);
      const equipmentName = getByHeaders_(row, headerMap, ['รายการ (ชิ้น)', 'รายการ', 'รายการอุปกรณ์', 'รายการ_อุปกรณ์']);

      if (!agency || !equipmentName) continue;

      rows.push([
        sheetName,
        i + 1,
        district,
        agency,
        equipmentName,
        getYearValue_(row, headerMap, 2564),
        getYearValue_(row, headerMap, 2565),
        getYearValue_(row, headerMap, 2566),
        getYearValue_(row, headerMap, 2567),
        getYearValue_(row, headerMap, 2568),
        getYearValue_(row, headerMap, 2569),
        getYearValue_(row, headerMap, 2570),
        toNumber_(getByHeaders_(row, headerMap, ['จำนวนที่สนับสนุน (ชิ้น)', 'จำนวนที่สนับสนุน'])),
        toNumber_(getByHeaders_(row, headerMap, ['ยืม (ชิ้น)', 'อ้างยืม (ชิ้น)', 'อ้าง (ชิ้น)', 'ยืม'])),
        toNumber_(getByHeaders_(row, headerMap, ['ชำรุด (ชิ้น)', 'ชำรุด'])),
        toNumber_(getByHeaders_(row, headerMap, ['คงเหลือ (ชิ้น)', 'คงเหลือ'])),
        toNumber_(getByHeaders_(row, headerMap, ['ใช้งานอยู่ (ชิ้น)', 'ใช้งานอยู่'])),
        now
      ]);
    }
  });

  appendRows_(target, rows);
}

function migrateP2Funding_(ss) {
  const target = getOrCreateSheet_(ss, P2_CONFIG.masterFunding);

  const headers = [
    'source_sheet',
    'source_row',
    'district',
    'agency',
    'budget_2564',
    'budget_2565',
    'budget_2566',
    'budget_2567',
    'budget_2568',
    'budget_2569',
    'budget_2570',
    'total_budget',
    'updated_at'
  ];

  resetSheet_(target, headers);

  const rows = [];
  const now = new Date();

  P2_CONFIG.fundingDistrictSheets.forEach(sheetName => {
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headerMap = getHeaderMap_(values[0]);
    const district = normalizeDistrictName_(sheetName.replace('งบ ', ''));

    for (let i = 1; i < values.length; i++) {
      const row = values[i];

      const agency = getByHeaders_(row, headerMap, ['หน่วยงาน', 'ชื่อหน่วยงาน', 'ชื่อ_หน่วยงาน']);
      if (!agency) continue;

      rows.push([
        sheetName,
        i + 1,
        district,
        agency,
        getYearValue_(row, headerMap, 2564),
        getYearValue_(row, headerMap, 2565),
        getYearValue_(row, headerMap, 2566),
        getYearValue_(row, headerMap, 2567),
        getYearValue_(row, headerMap, 2568),
        getYearValue_(row, headerMap, 2569),
        getYearValue_(row, headerMap, 2570),
        toNumber_(getByHeaders_(row, headerMap, ['รวมงบประมาณที่สนับสนุน', 'รวมงบประมาณที่สนับสนุน (บาท)', 'รวมงบประมาณที่สนับสนุน(บาท)'])),
        now
      ]);
    }
  });

  appendRows_(target, rows);
}

function migrateP2MapDestination_(ss) {
  const source = ss.getSheetByName(P2_CONFIG.mapSourceSheet);
  const target = getOrCreateSheet_(ss, P2_CONFIG.masterMap);

  const headers = [
    'source_sheet',
    'source_row',
    'workplace_id',
    'agency_type',
    'agency',
    'subdistrict',
    'district',
    'province',
    'google_map_link',
    'latlng',
    'latitude',
    'longitude',
    'phone',
    'updated_at'
  ];

  resetSheet_(target, headers);

  if (!source) {
    SpreadsheetApp.getUi().alert('ไม่พบชีทแผนที่: ' + P2_CONFIG.mapSourceSheet);
    return;
  }

  const values = source.getDataRange().getValues();
  if (values.length < 2) return;

  const headerMap = getHeaderMap_(values[0]);
  const rows = [];
  const now = new Date();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const agency = getByHeaders_(row, headerMap, [
      'หน่วยงาน รพ.สต.',
      'หน่วยงานรพ.สต.',
      'ชื่อหน่วยงาน',
      'ชื่อ_หน่วยงาน',
      'หน่วยงาน'
    ]);

    const subdistrict = getByHeaders_(row, headerMap, ['ตำบล', 'ชื่อ_ตำบล', 'ชื่อตำบล']);
    const district = getByHeaders_(row, headerMap, ['อำเภอ', 'ชื่อ_อำเภอ', 'ชื่ออำเภอ']);
    const province = getByHeaders_(row, headerMap, ['จังหวัด', 'ชื่อ_จังหวัด', 'ชื่อจังหวัด']);

    const mapLink = getByHeaders_(row, headerMap, [
      'google map',
      'googlemap',
      'link_google_map',
      'ลิงก์ google map',
      'ลิงก์แผนที่'
    ]);

    const latlng = getByHeaders_(row, headerMap, [
      'ละติจูด,ลองติจูด',
      'location_ละติจูด,ลองติจูด',
      'location',
      'latlng'
    ]);

    const phone = getByHeaders_(row, headerMap, ['เบอร์โทร', 'โทรศัพท์', 'เบอร์']);

    if (!agency) continue;

    const parsed = parseLatLng_(latlng);

    rows.push([
      P2_CONFIG.mapSourceSheet,
      i + 1,
      '',
      'หน่วยบริการ',
      agency,
      subdistrict,
      district,
      province,
      mapLink,
      latlng,
      parsed.latitude,
      parsed.longitude,
      phone,
      now
    ]);
  }

  appendRows_(target, rows);
}

/**
 * Helpers
 */
function getOrCreateSheet_(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
}

function resetSheet_(sheet, headers) {
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
}

function appendRows_(sheet, rows) {
  if (!rows.length) return;
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
}

function getHeaderMap_(headers) {
  const map = {};
  headers.forEach((h, i) => {
    const key = normalizeHeader_(h);
    if (key) map[key] = i;
  });
  return map;
}

function normalizeHeader_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\n/g, '')
    .replace(/_/g, '')
    .toLowerCase();
}

function getByHeaders_(row, headerMap, possibleHeaders) {
  for (const header of possibleHeaders) {
    const key = normalizeHeader_(header);
    if (headerMap[key] !== undefined) {
      return row[headerMap[key]];
    }
  }
  return '';
}

function getYearValue_(row, headerMap, year) {
  const possibleHeaders = [
    `ปีงบประมาณ ${year}`,
    `ปีงบประมาณ${year}`,
    `งบประมาณ ปี ${year}`,
    `งบประมาณปี ${year}`,
    `งบปี ${year}`,
    `งบ ปี ${year}`,
    `งบ ${year}`,
    `ปี ${year}`,
    `${year}`
  ];

  return toNumber_(getByHeaders_(row, headerMap, possibleHeaders));
}

function toNumber_(value) {
  if (value === null || value === undefined || value === '') return 0;

  const cleaned = String(value)
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');

  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function normalizeDistrictName_(sheetName) {
  return String(sheetName || '')
    .replace(/^งบ\s*/g, '')
    .replace(/^อ\./g, '')
    .trim();
}

function parseLatLng_(value) {
  if (!value) return { latitude: '', longitude: '' };

  const text = String(value).trim();
  const parts = text.split(',');

  if (parts.length < 2) return { latitude: '', longitude: '' };

  return {
    latitude: toNumber_(parts[0]),
    longitude: toNumber_(parts[1])
  };
}
