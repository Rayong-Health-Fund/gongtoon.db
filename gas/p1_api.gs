const P1_API_MASTER_SHEET = 'P1_Master_data';
const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const project = String(params.project || '').toLowerCase();
  const action = String(params.action || 'dashboard').toLowerCase();
  const session = validateSession_(params.token);

  if (project !== 'p1') {
    return jsonOutput_({ ok: false, error: 'รองรับเฉพาะ project=p1 ในไฟล์นี้' });
  }

  if (action === 'dashboard') {
    return jsonOutput_(getP1DashboardData_(session));
  }

  if (action === 'records') {
    if (!session) {
      return jsonOutput_({ ok: false, error: 'ต้องเข้าสู่ระบบก่อนดูข้อมูลรายบุคคล' });
    }
    return jsonOutput_({ ok: true, project: 'P1', records: getP1Records_() });
  }

  if (action === 'summary') {
    const records = getP1Records_();
    return jsonOutput_({ ok: true, project: 'P1', summary: buildP1Summary_(records) });
  }

  return jsonOutput_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
}

function validateSession_(token) {
  if (!token) return null;

  const ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  const sheet = ss.getSheetByName('sessions');
  if (!sheet) return null;

  const values = sheet.getDataRange().getValues();
  const now = Date.now();

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[0] === token) {
      const expiresAt = new Date(row[4]).getTime();
      if (expiresAt > now) {
        return { email: row[1], role: row[2], district: row[3] };
      }
      return null;
    }
  }
  return null;
}

function getP1DashboardData_(session) {
  const records = getP1Records_();

  const result = {
    ok: true,
    project: 'P1',
    projectName: 'โครงการปรับสภาพแวดล้อมที่อยู่อาศัยสำหรับคนพิการ ผู้สูงอายุ ผู้ป่วยที่อยู่ในระยะกึ่งเฉียบพลันและผู้ที่มีภาวะพึ่งพิง',
    updatedAt: new Date().toISOString(),
    summary: buildP1Summary_(records),
    filters: buildP1Filters_(records),
    charts: buildP1ChartAggregates_(records)
  };

  if (session) {
    result.records = records;
  }

  return result;
}

function getP1Records_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(P1_API_MASTER_SHEET);

  if (!sheet) {
    throw new Error('ไม่พบชีท ' + P1_API_MASTER_SHEET);
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) return [];

  const headers = values[0].map(h => String(h).trim());
  const rows = values.slice(1);

  return rows
    .filter(row => row.some(cell => String(cell).trim() !== ''))
    .map(row => {
      const obj = {};
      headers.forEach((header, index) => { obj[header] = row[index] || ''; });

      return {
        recordId: obj.record_id,
        sourceSheet: obj.source_sheet,
        sourceYearLabel: obj.source_year_label,
        budgetYearStart: toNumber_(obj.budget_year_start),
        budgetYearEnd: toNumber_(obj.budget_year_end),
        agency: obj.agency,
        personName: obj.person_name,
        age: toNumber_(obj.age),
        statusGroup: obj.status_group,
        isElderly: toBoolean_(obj.is_elderly),
        isDisabled: toBoolean_(obj.is_disabled),
        disabilityCodes: splitText_(obj.disability_codes),
        disabilityTypes: splitText_(obj.disability_types),
        rawTypeText: obj.raw_type_text,
        addressText: obj.address_text,
        subdistrict: obj.subdistrict,
        district: obj.district,
        province: obj.province,
        budget: toNumber_(obj.budget),
        projectStatus: obj.project_status,
        approvedDate: obj.approved_date,
        mouDate: obj.mou_date,
        note: obj.note
      };
    });
}

function buildP1Summary_(records) {
  const totalRecords = records.length;
  const completed = records.filter(r => r.projectStatus === 'แล้วเสร็จ').length;
  const inProgress = records.filter(r => r.projectStatus === 'กำลังดำเนินการ').length;
  const totalBudget = records.reduce((sum, r) => sum + (Number(r.budget) || 0), 0);

  const districts = unique_(records.map(r => r.district).filter(Boolean));
  const agencies = unique_(records.map(r => r.agency).filter(Boolean));

  return {
    totalRecords: totalRecords,
    completed: completed,
    inProgress: inProgress,
    totalBudget: totalBudget,
    districtCount: districts.length,
    agencyCount: agencies.length,
    averageBudgetPerRecord: totalRecords ? Math.round(totalBudget / totalRecords) : 0
  };
}

function buildP1ChartAggregates_(records) {
  const byYear = {};
  const byDistrict = {};
  const byType = {};
  const byDisability = {};
  const byAge = [0, 0, 0, 0, 0];

  records.forEach(r => {
    const year = r.sourceYearLabel || r.budgetYearStart || '—';
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

  return { byYear: byYear, byDistrict: byDistrict, byType: byType, byDisability: byDisability, byAge: byAge };
}

function buildP1Filters_(records) {
  return {
    years: unique_(records.map(r => r.sourceYearLabel).filter(Boolean)),
    districts: unique_(records.map(r => r.district).filter(Boolean)),
    subdistricts: unique_(records.map(r => r.subdistrict).filter(Boolean)),
    agencies: unique_(records.map(r => r.agency).filter(Boolean)),
    statuses: unique_(records.map(r => r.projectStatus).filter(Boolean)),
    statusGroups: unique_(records.map(r => r.statusGroup).filter(Boolean)),
    disabilityCodes: unique_(records.flatMap(r => r.disabilityCodes || []))
  };
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function unique_(arr) {
  return [...new Set(arr.map(v => String(v).trim()).filter(Boolean))];
}

function splitText_(value) {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean);
}

function toNumber_(value) {
  const cleaned = String(value || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}

function toBoolean_(value) {
  const text = String(value || '').toLowerCase().trim();
  return text === 'true' || text === 'yes' || text === '1' || text === 'ใช่';
}