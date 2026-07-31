const P3_SHEETS = [
  { tab: 'โครงการ ปี 65', year: 2565 },
  { tab: 'โครงการ ปี 66', year: 2566 },
  { tab: 'โครงการ ปี 67', year: 2567 },
  { tab: 'โครงการ ปี 68', year: 2568 },
  { tab: 'โครงการ ปี 69', year: 2569 }
];

const P3_STATUS_LABELS = {
  completed: 'เสร็จเรียบร้อย',
  in_progress: 'อยู่ระหว่างดำเนินการ'
};

function doGet(e) {
  try {
    const records = getP3Records_();
    return jsonOutput_({ ok: true, project: 'P3', records: records });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function getP3Records_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const records = [];

  P3_SHEETS.forEach(function(cfg) {
    const sheet = ss.getSheetByName(cfg.tab);
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    if (values.length < 2) return;

    const headers = values[0].map(function(h) { return String(h).trim(); });
    const colIndex = {};
    headers.forEach(function(h, i) { colIndex[h] = i; });

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const district = row[colIndex['อำเภอ']];
      const agency   = row[colIndex['ชื่อหน่วยบริการ']];
      const amount   = row[colIndex['จำนวนเงิน']];
      const name     = row[colIndex['ชื่อโครงการ']];
      const statusRaw = String(row[colIndex['status']] || '').trim();

      if (!district && !agency && !name) continue;

      records.push({
        y: cfg.year,
        d: district,
        u: agency,
        b: Number(amount) || 0,
        n: name,
        s: P3_STATUS_LABELS[statusRaw] || statusRaw
      });
    }
  });

  return records;
}

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
