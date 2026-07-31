const P1_API_MASTER_SHEET = 'P1_Master_data';

function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const project = String(params.project || '').toLowerCase();
  const action = String(params.action || 'dashboard').toLowerCase();

  if (project !== 'p1') {
    return jsonOutput_({
      ok: false,
      error: 'รองรับเฉพาะ project=p1 ในไฟล์นี้'
    });
  }

  if (action === 'dashboard') {
    return jsonOutput_(getP1DashboardData_());
  }

  if (action === 'records') {
    return jsonOutput_({
      ok: true,
      project: 'P1',
      records: getP1Records_()
    });
  }

  if (action === 'summary') {
    const records = getP1Records_();
    return jsonOutput_({
      ok: true,
      project: 'P1',
      summary: buildP1Summary_(records)
    });
  }

  return jsonOutput_({
    ok: false,
    error: 'ไม่รู้จัก action: ' + action
  });
}

function getP1DashboardData_() {
  const records = getP1Records_();

  return {
    ok: true,
    project: 'P1',
    projectName: 'โครงการปรับสภาพแวดล้อมที่อยู่อาศัยสำหรับคนพิการ ผู้สูงอายุ ผู้ป่วยที่อยู่ในระยะกึ่งเฉียบพลันและผู้ที่มีภาวะพึ่งพิง',
    updatedAt: new Date().toISOString(),
    summary: buildP1Summary_(records),
    filters: buildP1Filters_(records),
    records: records
  };
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

      headers.forEach((header, index) => {
        obj[header] = row[index] || '';
      });

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
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function unique_(arr) {
  return [...new Set(arr.map(v => String(v).trim()).filter(Boolean))];
}

function splitText_(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
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
