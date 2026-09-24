'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT — 30 minutes timeout
// ═══════════════════════════════════════════════════════════════════════════
function validateSession() {
  try {
    var session = JSON.parse(localStorage.getItem('rf_user') || 'null');
    if (!session || !session.expiresAt) return false;
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem('rf_user');
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Check session on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    if (!validateSession() && window.location.pathname.includes(('staff-hub.html|entry-form|admin-inbox|user-requests|executive-dashboard').split('|').join('|'))) {
      localStorage.removeItem('rf_user');
      window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
  });
} else if (!validateSession() && window.location.pathname.includes(('staff-hub.html|entry-form|admin-inbox|user-requests|executive-dashboard').split('|').join('|'))) {
  localStorage.removeItem('rf_user');
  window.location.href = 'login.html?next=' + encodeURIComponent(window.location.pathname + window.location.search);
}

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

// Reads a numeric value; tries Thai spreadsheet column name first, then English alias.
function p4GetNum(row, thaiKey, engKey) {
  if (Object.prototype.hasOwnProperty.call(row, thaiKey)) return Number(row[thaiKey]) || 0;
  if (engKey && Object.prototype.hasOwnProperty.call(row, engKey)) return Number(row[engKey]) || 0;
  return 0;
}

// Reads a string value; tries Thai spreadsheet column name first, then English alias.
function p4GetText(row, thaiKey, engKey) {
  if (Object.prototype.hasOwnProperty.call(row, thaiKey)) return String(row[thaiKey] || '').trim();
  return String(row[engKey] || '').trim();
}

// Sums multiple Thai columns; falls back to a single English key if no Thai keys are present.
function p4SumThai(row, thaiKeys, engKey) {
  var hasAny = thaiKeys.some(function(k) { return Object.prototype.hasOwnProperty.call(row, k); });
  if (hasAny) return thaiKeys.reduce(function(sum, k) { return sum + (Number(row[k]) || 0); }, 0);
  return (engKey && Object.prototype.hasOwnProperty.call(row, engKey)) ? Number(row[engKey]) || 0 : 0;
}

// Pivot flat multi-year device rows into the data_by_year shape that
// initP4() / loadP4Data() already know how to consume.
//
// Uses a two-pass algorithm:
//   Pass 1 — read raw column values per item per year (Thai column names first, English fallback).
//             Year 2568 sums both procurement phases; year 2569 sums direct + form submissions.
//   Pass 2 — carry-forward: if a year has no explicit spreadsheet data but the previous year
//             had a positive remaining balance, create a synthetic row so the item stays visible.
//             This prevents an item purchased in 2566 from disappearing in the 2568 view.
var P4_YEARS = ['2566', '2567', '2568', '2569'];

function p4NormalizeDevices(rows) {
  // — Pass 1: group raw year data by unique item key ——————————————————————
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

  // — Pass 2: carry-forward missing years, produce data_by_year ——————————
  var data_by_year = {};

  Object.keys(itemMap).forEach(function(key) {
    var item = itemMap[key];
    var prevBal = 0;

    P4_YEARS.forEach(function(year) {
      var yd = item.yr[year];
      if (yd) {
        // Explicit spreadsheet data exists for this year.
        // If the authoritative balance column is missing or zero but we have a prior balance,
        // recompute so the user never sees a phantom zero drop.
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
        // No spreadsheet data for this year but stock exists — carry it forward.
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
        // prevBal unchanged — stock still available
      }
      // prevBal = 0 and no data → item not in circulation yet; skip silently
    });
  });

  return data_by_year;
}

// Map flat funding rows into the budget array shape used by initP4().
// Tries actual Thai spreadsheet column names first, then English aliases.
// Budget values may include Thai currency formatting (e.g. " ฿ 497,500 "); strips non-numeric.
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
  // Ready-made data file, refreshed from the Fund's own Excel/CSV files via
  // device-repair/generate_data.js (which runs this same p4BuildData logic
  // ahead of time). Already in the exact shape p4LiveData needs, so no
  // normalizing here — just read the file.
  fetch('device-repair/data/dashboard_data.json')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(liveData) {
    window.p4LiveData  = liveData;
    window.p4ApiState  = 'ready';

    // Derive summary counts from normalized live data (avoids raw API column-name dependency)
    var centersSet = {}, districtSet = {};
    window.p4LiveData.available_years.forEach(function(y) {
      (window.p4LiveData.data_by_year[y] || []).forEach(function(r) {
        if (r.unit)     centersSet[r.unit]     = true;
        if (r.district) districtSet[r.district] = true;
      });
    });
    var totalCenters   = Object.keys(centersSet).length;
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
    console.warn('[P4] data file load failed — using empty fallback:', err);
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
