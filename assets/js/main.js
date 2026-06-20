'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT 1 — House Adaptation (ปรับสภาพบ้านผู้พิการและผู้สูงอายุ)
// ═══════════════════════════════════════════════════════════════════════════

var P1_PRIVATE = ['ที่อยู่_บ้านเลขที่', 'บ้านเลขที่', 'house_no', 'houseNo'];

var P1_COLS = {
  name:          ['ชื่อ_ผู้รับงบประมาณ', 'ชื่อผู้รับงบประมาณ', 'ชื่อ-นามสกุล', 'ชื่อ', 'name'],
  personStatus:  ['สถานะภาพ', 'สถานะบุคคล', 'ประเภท', 'status'],
  district:      ['ที่อยู่_อำเภอ', 'อำเภอ', 'district'],
  subdistrict:   ['ที่อยู่_ตำบล', 'ตำบล', 'subdistrict'],
  budget:        ['งบประมาณ', 'งบ', 'budget'],
  budgetYear:    ['ปี_งบประมาณ', 'ปีงบประมาณ', 'year'],
  projectStatus: ['สถานะ_โครงการ', 'สถานะโครงการ', 'สถานะ', 'projectStatus'],
  agency:        ['ชื่อ_หน่วยงาน', 'หน่วยงาน', 'agency'],
  timestamp:     ['Timestamp', 'timestamp', 'เวลาที่ตอบแบบฟอร์ม', 'วันที่และเวลา', 'วันที่', 'เวลา']
};

function p1Col(row, field) {
  var aliases = P1_COLS[field] || [];
  for (var i = 0; i < aliases.length; i++) {
    var v = row[aliases[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

// Normalize API response → array of plain objects (handles all GAS response shapes)
function p1Normalize(data) {
  if (!data) return [];
  if (data.data   && Array.isArray(data.data))   return p1Normalize(data.data);
  if (data.values && Array.isArray(data.values))  return p1Normalize(data.values);
  if (!Array.isArray(data) || data.length === 0)  return [];
  if (typeof data[0] === 'object' && !Array.isArray(data[0])) return data;
  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = (row[i] !== undefined ? row[i] : ''); });
    return obj;
  });
}

function p1FormatBudget(val) {
  if (!val) return '—';
  var n = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  if (isNaN(n) || n === 0) return '—';
  if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 });
}

function p1PersonBadge(status) {
  if (!status) return '<span class="p1-badge p1-badge-other">—</span>';
  if (status.indexOf('พิการ') !== -1)  return '<span class="p1-badge p1-badge-disabled">ผู้พิการ</span>';
  if (status.indexOf('สูงอายุ') !== -1) return '<span class="p1-badge p1-badge-elderly">ผู้สูงอายุ</span>';
  if (status.indexOf('รวม') !== -1)     return '<span class="p1-badge p1-badge-mixed">กลุ่มรวม</span>';
  return '<span class="p1-badge p1-badge-other">' + status + '</span>';
}

function p1ProjectBadge(status) {
  if (!status) return '<span class="p1-badge p1-badge-other">—</span>';
  if (status.indexOf('แล้วเสร็จ') !== -1 || status.indexOf('เสร็จ') !== -1)
    return '<span class="p1-badge p1-badge-done">แล้วเสร็จ</span>';
  if (status.indexOf('ดำเนินการ') !== -1 || status.indexOf('กำลัง') !== -1)
    return '<span class="p1-badge p1-badge-ongoing">กำลังดำเนินการ</span>';
  if (status.indexOf('อนุมัติ') !== -1 || status.indexOf('รอ') !== -1)
    return '<span class="p1-badge p1-badge-pending">รออนุมัติ</span>';
  return '<span class="p1-badge p1-badge-other">' + status + '</span>';
}

// Returns true if any form entry was submitted within the last 24 hours
function p1HasRecentEntry(formRows) {
  var cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (var i = 0; i < formRows.length; i++) {
    var ts = p1Col(formRows[i], 'timestamp');
    if (!ts) continue;
    var d = new Date(ts);
    if (!isNaN(d.getTime()) && d.getTime() > cutoff) return true;
  }
  return false;
}

function p1RefreshHeight() {
  var body = document.getElementById('accBody1');
  var item = document.getElementById('accItem1');
  if (body && item && item.classList.contains('open')) {
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function p1FadeIn(container) {
  container.style.opacity = '0';
  container.style.transition = 'opacity 0.3s ease';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { container.style.opacity = '1'; });
  });
}

function p1RenderContent(allHouseData, formsData) {
  var masterRows = p1Normalize(allHouseData);
  var formRows   = p1Normalize(formsData);

  // Aggregate stats from live API data
  var totalHouses = masterRows.length;
  var totalBudgetNum = 0;
  masterRows.forEach(function(row) {
    var b = parseFloat(String(p1Col(row, 'budget')).replace(/[^0-9.]/g, '')) || 0;
    totalBudgetNum += b;
  });
  var budgetM = totalBudgetNum > 0 ? (totalBudgetNum / 1000000).toFixed(2) : '15.89';

  // Notification dot: show red badge if any form entry is < 24h old
  var hasRecent = p1HasRecentEntry(formRows);
  var notifDot  = document.getElementById('p1NotifDot');
  if (notifDot) notifDot.style.display = hasRecent ? 'inline-block' : 'none';

  // Update accordion header mini-stats with live API counts
  var elHouses = document.getElementById('p1HeaderHouses');
  var elBudget = document.getElementById('p1HeaderBudget');
  if (elHouses && totalHouses) elHouses.textContent = totalHouses;
  if (elBudget && totalBudgetNum) elBudget.textContent = budgetM + 'M';

  // Show live badge in the inline dashboard if open
  var now = new Date();
  var ts = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
           + ' ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  var liveEl = document.getElementById('p1-live-status');
  if (liveEl) {
    liveEl.innerHTML = '<div class="p1-live-badge"><div class="p1-live-dot"></div>ข้อมูลสด · อัปเดต ' + ts + '</div>';
  }
}

function p1RenderError() {
  // Silent fail — inline dashboard shows static data from project1Records
  var notifDot = document.getElementById('p1NotifDot');
  if (notifDot) notifDot.style.display = 'none';
}

function renderProject1Dashboard() {
  Promise.all([
    fetchProject1Data('all_house'),
    fetchProject1Data('การตอบแบบฟอร์ม 1')
  ]).then(function(results) {
    p1RenderContent(results[0], results[1]);
  }).catch(function(err) {
    console.warn('Project 1 fetch error:', err);
    p1RenderError();
  });
}

document.addEventListener('DOMContentLoaded', function() {
  renderProject1Dashboard();
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT 2 — Medical Equipment (ศูนย์สาธิตและยืมอุปกรณ์)
// ═══════════════════════════════════════════════════════════════════════════

var P2_PRIVATE = ['หมายเลขบัตรประชาชน', 'ชื่อนามสกุลผู้ยืม'];

var P2_COLS = {
  district:    ['ชื่อ_อำเภอ', 'อำเภอ', 'district'],
  agency:      ['ชื่อ_หน่วยงาน', 'หน่วยงาน'],
  equipName:   ['รายการ_อุปกรณ์_(ชิ้น)', 'รายการอุปกรณ์', 'อุปกรณ์', 'รายการ'],
  budgetYear:  ['ปี_งบประมาณ', 'ปีงบประมาณ'],
  status:      ['สถานะ_อุปกรณ์', 'สถานะ'],
  equipCode:   ['รหัส_อุปกรณ์(ห้ามแก้ไข)', 'รหัสอุปกรณ์'],
  condition:   ['สภาพอุปกรณ์ล่าสุด'],
  orgId:       ['รหัส_หน่วยงาน'],
  orgType:     ['ประเภท_หน่วยงาน'],
  orgName:     ['ชื่อ_หน่วยงาน'],
  subdistrict: ['ชื่อ_ตำบล', 'ตำบล'],
  mapDistrict: ['ชื่อ_อำเภอ'],
  mapLink:     ['link_google_map', 'google_map'],
  phone:       ['เบอร์โทร', 'phone', 'tel']
};

function p2Col(row, field) {
  var aliases = P2_COLS[field] || [];
  for (var i = 0; i < aliases.length; i++) {
    var v = row[aliases[i]];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function p2FormatPhone(raw) {
  if (!raw) return '';
  var p = String(raw).replace(/[^0-9]/g, '');
  if (p.length === 9)  return p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6);
  if (p.length === 10) return p.slice(0, 3) + '-' + p.slice(3, 6) + '-' + p.slice(6);
  return raw;
}

var P2_TYPE_ORDER = {
  'โรงพยาบาล': 0,
  'สำนักงานสาธารณสุขอำเภอ': 1,
  'ศูนย์บริการสาธารณสุข': 2,
  'สถานีอนามัย': 3,
  'โรงพยาบาลส่งเสริมสุขภาพตำบล': 4
};

function p2TypeInfo(type) {
  if (!type) return { cls: 'p2-type-other', label: '—' };
  if (type.indexOf('โรงพยาบาลส่งเสริม') !== -1) return { cls: 'p2-type-hpc',    label: 'รพ.สต.' };
  if (type.indexOf('โรงพยาบาล')         !== -1) return { cls: 'p2-type-hosp',   label: 'รพ.' };
  if (type.indexOf('สำนักงานสาธารณสุข') !== -1) return { cls: 'p2-type-pho',    label: 'สสอ.' };
  if (type.indexOf('ศูนย์บริการ')        !== -1) return { cls: 'p2-type-hcenter',label: 'ศบส.' };
  if (type.indexOf('สถานีอนามัย')        !== -1) return { cls: 'p2-type-station',label: 'สอ.' };
  return { cls: 'p2-type-other', label: 'อื่นๆ' };
}

function p2RefreshHeight() {
  var body = document.getElementById('accBody2');
  var item = document.getElementById('accItem2');
  if (body && item && item.classList.contains('open')) {
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function p2FadeIn(container) {
  container.style.opacity = '0';
  container.style.transition = 'opacity 0.3s ease';
  requestAnimationFrame(function() {
    requestAnimationFrame(function() { container.style.opacity = '1'; });
  });
}

function p2FilterCenters(query) {
  var items = document.querySelectorAll('.p2-center-item');
  var q = (query || '').toLowerCase().trim();
  items.forEach(function(el) {
    el.style.display = (!q || el.textContent.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
  });
}
window.p2FilterCenters = p2FilterCenters;

function p2BuildMapSection(mapRows) {
  if (!mapRows || mapRows.length === 0) return '';
  var sorted = mapRows.slice().sort(function(a, b) {
    var typeA = p2Col(a, 'orgType'), typeB = p2Col(b, 'orgType');
    var oA = P2_TYPE_ORDER[typeA] !== undefined ? P2_TYPE_ORDER[typeA] : 5;
    var oB = P2_TYPE_ORDER[typeB] !== undefined ? P2_TYPE_ORDER[typeB] : 5;
    if (oA !== oB) return oA - oB;
    return (p2Col(a, 'mapDistrict') + p2Col(a, 'orgName'))
           .localeCompare(p2Col(b, 'mapDistrict') + p2Col(b, 'orgName'), 'th');
  });
  var rows = sorted.map(function(row) {
    var name    = p2Col(row, 'orgName')     || '—';
    var type    = p2Col(row, 'orgType');
    var dist    = p2Col(row, 'mapDistrict') || '';
    var phone   = p2Col(row, 'phone');
    var mapLink = p2Col(row, 'mapLink');
    var info    = p2TypeInfo(type);
    var phonePart = phone
      ? '<a href="tel:' + phone + '" class="p2-action-btn p2-tel-btn">📞 ' + p2FormatPhone(phone) + '</a>'
      : '<span class="p2-action-btn p2-no-tel">—</span>';
    var mapPart = mapLink
      ? '<a href="' + mapLink + '" target="_blank" rel="noopener" class="p2-action-btn p2-map-btn">📍 นำทาง</a>'
      : '';
    return '<div class="p2-center-item">' +
      '<span class="p2-type-badge ' + info.cls + '">' + info.label + '</span>' +
      '<span class="p2-center-name">' + name + '</span>' +
      '<span class="p2-center-dist">' + dist + '</span>' +
      '<span class="p2-center-actions">' + phonePart + mapPart + '</span>' +
    '</div>';
  }).join('');
  return '<div class="p1-section-label">🗺️ ศูนย์บริการ · ' + sorted.length + ' แห่ง</div>' +
    '<div class="p2-search-wrap"><input type="text" class="p2-search-input" ' +
      'placeholder="ค้นหาชื่อหน่วยงาน อำเภอ..." oninput="p2FilterCenters(this.value)"></div>' +
    '<div class="p2-center-list" id="p2-center-list">' + rows + '</div>';
}

function p2BuildEquipSection(masterRows) {
  if (!masterRows || masterRows.length === 0) return '';
  var groups = {};
  masterRows.forEach(function(row) {
    var name   = p2Col(row, 'equipName') || '—';
    var status = p2Col(row, 'status');
    if (!groups[name]) groups[name] = { total: 0, inUse: 0, avail: 0, broken: 0 };
    groups[name].total++;
    if (status === 'ใช้งานอยู่') groups[name].inUse++;
    else if (status === 'พร้อม')   groups[name].avail++;
    else if (status === 'ชำรุด')   groups[name].broken++;
  });
  var list = Object.keys(groups).map(function(k) {
    return Object.assign({ name: k }, groups[k]);
  }).sort(function(a, b) { return b.total - a.total; }).slice(0, 6);
  var rows = list.map(function(eq) {
    var usePct   = Math.round((eq.inUse  / eq.total) * 100);
    var availPct = Math.round((eq.avail  / eq.total) * 100);
    var breakPct = Math.round((eq.broken / eq.total) * 100);
    return '<div class="p2-equip-row">' +
      '<div class="p2-equip-name">' + eq.name + '</div>' +
      '<div class="p2-equip-right">' +
        '<span class="p2-equip-total">' + eq.total + ' ชิ้น</span>' +
        '<div class="p2-equip-bar">' +
          '<div class="p2-bar-use"   style="width:' + usePct   + '%"></div>' +
          '<div class="p2-bar-avail" style="width:' + availPct + '%"></div>' +
          '<div class="p2-bar-break" style="width:' + breakPct + '%"></div>' +
        '</div>' +
        '<div class="p2-equip-legend">' +
          (eq.inUse  ? '<span class="p2-legend-use">'  + eq.inUse  + ' ใช้</span>'   : '') +
          (eq.avail  ? '<span class="p2-legend-avail">' + eq.avail  + ' พร้อม</span>' : '') +
          (eq.broken ? '<span class="p2-legend-break">' + eq.broken + ' ชำรุด</span>' : '') +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
  return '<div class="p1-section-label">⚙️ ประเภทอุปกรณ์ยอดนิยม (Top 6)</div>' +
         '<div class="p2-equip-list">' + rows + '</div>';
}

function p2RenderContent(masterData, formsData, mapData) {
  var container = document.getElementById('p2-content');
  if (!container) return;

  var masterRows = p1Normalize(masterData);
  var formRows   = p1Normalize(formsData);
  var mapRows    = p1Normalize(mapData);

  // Aggregate equipment stats + location counts per status
  var totalEquip = masterRows.length;
  var inUse = 0, avail = 0, broken = 0;
  var inUseLocSet = {}, availLocSet = {};
  var equipTypeSet = {}, districtSet = {};

  masterRows.forEach(function(row) {
    var status = p2Col(row, 'status');
    var agency = p2Col(row, 'agency');
    if (status === 'ใช้งานอยู่') {
      inUse++;
      if (agency) inUseLocSet[agency] = true;
    } else if (status === 'พร้อม') {
      avail++;
      if (agency) availLocSet[agency] = true;
    } else if (status === 'ชำรุด') {
      broken++;
    }
    var eq = p2Col(row, 'equipName');
    if (eq) equipTypeSet[eq] = true;
    var d  = p2Col(row, 'district');
    if (d) districtSet[d] = true;
  });

  var inUseLocs  = Object.keys(inUseLocSet).length;
  var availLocs  = Object.keys(availLocSet).length;
  var totalTypes   = Object.keys(equipTypeSet).length;
  var totalCenters = mapRows.length;
  var formsCount   = formRows.length;
  var usePct       = totalEquip ? Math.round((inUse / totalEquip) * 100) : 75;

  // Update accordion header mini-stats
  var elCount = document.getElementById('p2HeaderCount');
  var elTypes = document.getElementById('p2HeaderTypes');
  if (elCount) elCount.textContent = totalEquip.toLocaleString('th-TH') || '3,388';
  if (elTypes) elTypes.textContent = totalTypes || '26';

  var now = new Date();
  var ts = now.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
           + ' ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

  var html =
    '<div class="p1-live-badge" style="color:#d97706;background:#fffbeb;border-color:#fde68a;">' +
      '<div class="p1-live-dot" style="background:#f59e0b;"></div>ข้อมูลสด · อัปเดต ' + ts +
    '</div>' +

    '<div class="kpi-summary-3">' +
      '<div class="kpi3-card" style="border-top-color:#d97706;">' +
        '<span class="kpi3-num" style="color:#d97706;">' + (totalEquip || 3388).toLocaleString('th-TH') + '</span>' +
        '<span class="kpi3-unit">หน่วย</span>' +
        '<span class="kpi3-label">อุปกรณ์ทั้งหมด</span>' +
      '</div>' +
      '<div class="kpi3-card" style="border-top-color:#6366f1;">' +
        '<span class="kpi3-num" style="color:#6366f1;">' + inUse.toLocaleString('th-TH') + '</span>' +
        '<span class="kpi3-unit">หน่วย · ' + inUseLocs + ' แห่ง</span>' +
        '<span class="kpi3-label">กำลังใช้งาน</span>' +
      '</div>' +
      '<div class="kpi3-card" style="border-top-color:#10b981;">' +
        '<span class="kpi3-num" style="color:#10b981;">' + avail.toLocaleString('th-TH') + '</span>' +
        '<span class="kpi3-unit">หน่วย · ' + availLocs + ' แห่ง</span>' +
        '<span class="kpi3-label">พร้อมให้ยืม</span>' +
      '</div>' +
    '</div>' +

    '<div class="acc-progress-bar">' +
      '<div class="acc-progress-fill" style="width:' + usePct + '%;background:#f59e0b;"></div>' +
    '</div>' +

    '<p class="acc-summary-text">' +
      'จัดให้บริการอุปกรณ์ฟื้นฟูสมรรถภาพรวม ' + (totalEquip || 3388).toLocaleString('th-TH') + ' ชิ้น' +
      ' ครอบคลุม ' + (totalTypes || 26) + ' ประเภท ใน ' + (totalCenters || 73) + ' หน่วยบริการ' +
      (formsCount > 0 ? ' · บันทึกข้อมูลใหม่ผ่านฟอร์ม ' + formsCount + ' รายการ' : '') +
    '</p>' +

    p2BuildEquipSection(masterRows) +
    p2BuildMapSection(mapRows);

  container.innerHTML = html;
  p2FadeIn(container);
  setTimeout(p2RefreshHeight, 100);
}

function p2RenderError() {
  var container = document.getElementById('p2-content');
  if (!container) return;
  container.innerHTML =
    '<div class="p1-error-wrap">⚠️ ไม่สามารถโหลดข้อมูลสดได้ กำลังแสดงข้อมูลสำรอง</div>' +
    '<div class="kpi-summary-3">' +
      '<div class="kpi3-card" style="border-top-color:#d97706;"><span class="kpi3-num" style="color:#d97706;">3,388</span><span class="kpi3-unit">หน่วย</span><span class="kpi3-label">อุปกรณ์ทั้งหมด</span></div>' +
      '<div class="kpi3-card" style="border-top-color:#6366f1;"><span class="kpi3-num" style="color:#6366f1;">1,910</span><span class="kpi3-unit">หน่วย</span><span class="kpi3-label">กำลังใช้งาน</span></div>' +
      '<div class="kpi3-card" style="border-top-color:#10b981;"><span class="kpi3-num" style="color:#10b981;">1,457</span><span class="kpi3-unit">หน่วย</span><span class="kpi3-label">พร้อมให้ยืม</span></div>' +
    '</div>' +
    '<div class="acc-progress-bar"><div class="acc-progress-fill" style="width:75%;background:#f59e0b;"></div></div>' +
    '<p class="acc-summary-text">จัดให้บริการอุปกรณ์ฟื้นฟูสมรรถภาพรวม 3,388 ชิ้น ครอบคลุม 26 ประเภท ใน 73 หน่วยบริการทั่วจังหวัดระยอง</p>';
  p2FadeIn(container);
  setTimeout(p2RefreshHeight, 100);
}

function renderProject2Dashboard() {
  Promise.all([
    fetchProject2Data('all_equipment_data'),
    fetchProject2Data('การตอบแบบฟอร์ม 1'),
    fetchProject2Data('all_map_destination')
  ]).then(function(results) {
    p2RenderContent(results[0], results[1], results[2]);
  }).catch(function(err) {
    console.warn('Project 2 fetch error:', err);
    p2RenderError();
  });
}

document.addEventListener('DOMContentLoaded', function() {
  renderProject2Dashboard();
});

// ═══════════════════════════════════════════════════════════════════════════
// PROJECT 4 — Device Repair Centers (ศูนย์ซ่อมอุปกรณ์ผู้พิการและผู้สูงอายุ)
// ═══════════════════════════════════════════════════════════════════════════

// API dates arrive as ISO strings whose year is already Buddhist Era
// (e.g. "2566-07-24T17:00:00.000Z"). Subtract 543 to get CE before parsing,
// then format back with th-TH locale so the display shows the correct BE year.
function p4FormatDate(isoStr) {
  if (!isoStr || String(isoStr).trim() === '' || isoStr === '-') return '-';
  try {
    var s = String(isoStr).trim();
    var beYear = parseInt(s.substring(0, 4), 10);
    if (beYear > 2400) s = (beYear - 543) + s.substring(4);
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(isoStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch(e) { return String(isoStr); }
}

// Maps API year-suffix columns to display year labels
var P4_YEAR_MAP = [
  { year: '2566', buy: 'buy66', paid: 'paid66', bal: 'balance66' },
  { year: '2567', buy: 'buy67', paid: 'paid67', bal: 'balance67' },
  { year: '2568', buy: 'buy68', paid: 'paid68', bal: 'balance68' },
  { year: '2569', buy: 'buy69', paid: 'paid69', bal: 'balance69' }
];

// Pivot flat multi-year device rows into the data_by_year shape that
// initP4() / loadP4Data() already know how to consume.
function p4NormalizeDevices(rows) {
  var data_by_year = {};
  rows.forEach(function(row) {
    P4_YEAR_MAP.forEach(function(yc) {
      var bought = Number(row[yc.buy])  || 0;
      var paid   = Number(row[yc.paid]) || 0;
      var bal    = Number(row[yc.bal])  || 0;
      if (bought === 0 && paid === 0 && bal === 0) return;
      if (!data_by_year[yc.year]) data_by_year[yc.year] = [];
      data_by_year[yc.year].push({
        district:  row.district    || '',
        unit:      row.center_name || '',
        category:  String(row.category || '').trim(),
        equipment: row.item        || '',
        unit_type: row.unit        || '',
        year:      yc.year,
        purchased: bought,
        used:      paid,
        remaining: bal
      });
    });
  });
  return data_by_year;
}

// Map flat funding rows into the budget array shape used by initP4().
function p4NormalizeFunding(rows) {
  return rows.map(function(b) {
    return {
      year:      String(b.budget_year || ''),
      unit:      b.agency || '',
      budget:    Number(b.budget) || 0,
      submitted: p4FormatDate(b.submit_date),
      approved:  p4FormatDate(b.approve_date),
      mou:       p4FormatDate(b.mou_date),
      received:  p4FormatDate(b.check_date),
      reported:  p4FormatDate(b.report_date),
      notes:     b.remark || ''
    };
  });
}

// Assemble the full project4Data-compatible object from raw API arrays.
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

function renderProject4Dashboard() {
  console.log('[P4] renderProject4Dashboard: fetch start');

  // Safety net: if the GAS API hangs and never resolves, fall back after 20 s.
  var p4ApiTimeoutId = setTimeout(function() {
    if (window.p4ApiState === undefined) {
      console.warn('[P4] API timeout after 20 s — falling back to static data');
      window.p4ApiState = 'error';
      if (window.p4Initialized) {
        window.p4Initialized = false;
        if (typeof initP4 === 'function') initP4();
      }
    }
  }, 20000);

  Promise.all([
    fetchProject4Data('devices'),
    fetchProject4Data('funding')
  ]).then(function(results) {
    clearTimeout(p4ApiTimeoutId);
    var devicesRows = p1Normalize(results[0]);
    var fundingRows = p1Normalize(results[1]);
    console.log('[P4] fetched — devices:', devicesRows.length, ' funding:', fundingRows.length);
    window.p4LiveData  = p4BuildData(devicesRows, fundingRows);
    window.p4ApiState  = 'ready';
    console.log('[P4] p4ApiState = ready | years:', window.p4LiveData.available_years);

    // Derive summary counts from live data
    var centersSet = {};
    devicesRows.forEach(function(r) { if (r.center_name) centersSet[r.center_name] = true; });
    var totalCenters = Object.keys(centersSet).length;

    var districtSet = {};
    devicesRows.forEach(function(r) { if (r.district) districtSet[r.district] = true; });
    var totalDistricts = Object.keys(districtSet).length;

    var totalYears   = window.p4LiveData.available_years.length;
    var totalCats    = window.p4LiveData.categories.length;
    var totalBudget  = 0;
    Object.keys(window.p4LiveData.budget_totals).forEach(function(y) {
      totalBudget += (window.p4LiveData.budget_totals[y] || 0);
    });

    // Update accordion header mini-stats
    var elCenters = document.getElementById('p4HeaderCenters');
    var elBudget  = document.getElementById('p4HeaderBudget');
    if (elCenters) elCenters.textContent = totalCenters;
    if (elBudget)  elBudget.textContent  = (totalBudget / 1000000).toFixed(2) + 'M';

    // Update inner summary cards
    var elCats  = document.getElementById('p4StatCategories');
    var elDists = document.getElementById('p4StatDistricts');
    var elYears = document.getElementById('p4StatYears');
    if (elCats)  elCats.textContent  = totalCats;
    if (elDists) elDists.textContent = totalDistricts;
    if (elYears) elYears.textContent = totalYears;

    // Always write the grand-total budget (year-filter independent)
    var elTotalBudget = document.getElementById('p4TotalBudget');
    if (elTotalBudget) elTotalBudget.textContent = (totalBudget / 1000000).toFixed(2) + 'M';

    // Update the alert-info summary sentence with live counts
    var elAlert = document.getElementById('p4AlertInfo');
    if (elAlert) elAlert.innerHTML =
      '<strong>สรุปข้อมูล:</strong> ' + totalCats + ' กลุ่มอุปกรณ์, ' +
      totalYears + ' ปีงบประมาณ, ' + totalDistricts + ' อำเภอ, ' +
      totalCenters + ' ศูนย์ซ่อม';

    // If accordion was already opened with fallback data, re-render with live data
    if (window.p4Initialized) {
      var yearSel    = document.getElementById('p4YearSelect');
      var distSel    = document.getElementById('p4DistrictSelect');
      var unitSel    = document.getElementById('p4UnitSelect');
      var catSel     = document.getElementById('p4CategorySelect');
      var budYearSel = document.getElementById('p4BudgetYearSelect');
      var bBody      = document.getElementById('p4BudgetBody');
      // Preserve manual year selection so live re-init doesn't override user's choice
      var savedYear  = (window.p4UserSelectedYear && yearSel) ? yearSel.value : null;
      if (yearSel)    yearSel.innerHTML    = '<option value="all">ทั้งหมด</option>';
      if (distSel)    distSel.innerHTML    = '<option value="all">ทั้งหมด</option>';
      if (unitSel)    unitSel.innerHTML    = '<option value="all">ทั้งหมด</option>';
      if (catSel)     catSel.innerHTML     = '<option value="all">ทั้งหมด</option>';
      if (budYearSel) budYearSel.innerHTML = '<option value="all">ทั้งหมด</option>';
      if (bBody)      bBody.innerHTML      = '';
      window.p4Initialized = false;
      if (typeof initP4 === 'function') {
        initP4(); // defaults to newest live year, resets p4UserSelectedYear
        // Restore user's manual selection if that year exists in live data
        if (savedYear && yearSel) {
          var optFound = false;
          for (var oi = 0; oi < yearSel.options.length; oi++) {
            if (yearSel.options[oi].value === savedYear) { optFound = true; break; }
          }
          if (optFound) {
            yearSel.value = savedYear;
            window.p4UserSelectedYear = true;
            loadP4Data();
          }
        }
      }
    }
  }).catch(function(err) {
    clearTimeout(p4ApiTimeoutId);
    console.warn('[P4] fetch error — using fallback data:', err);
    window.p4ApiState = 'error';
    // If accordion is open in skeleton state, fall back to static data
    if (window.p4Initialized) {
      window.p4Initialized = false;
      if (typeof initP4 === 'function') initP4();
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  renderProject4Dashboard();
});
