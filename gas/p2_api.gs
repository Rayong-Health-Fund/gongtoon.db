function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const type = (e.parameter.type || e.parameter.sheet || '').toLowerCase();

  const routes = {
    equipment: 'P2_MASTER_EQUIPMENT_LOAN',
    funding: 'P2_MASTER_FUNDING',
    map: 'P2_MASTER_MAP_DESTINATION',
    ref_equipment: 'P2_REF_EQUIPMENT'
  };

  const sheetName = routes[type];

  if (!sheetName) {
    return jsonOutput_({
      error: true,
      message: 'กรุณาระบุ type ให้ถูกต้อง: equipment, funding, map, ref_equipment',
      available_types: Object.keys(routes)
    });
  }

  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return jsonOutput_({
      error: true,
      message: 'ไม่พบชีท: ' + sheetName
    });
  }

  const data = sheetToJson_(sheet);

  return jsonOutput_({
    error: false,
    type: type,
    sheet: sheetName,
    count: data.length,
    updated_at: new Date(),
    data: data
  });
}

function sheetToJson_(sheet) {
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => String(h || '').trim());
  const rows = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];

    const isEmpty = row.every(cell => cell === '' || cell === null);
    if (isEmpty) continue;

    const obj = {};

    headers.forEach((header, index) => {
      if (!header) return;

      const value = row[index];

      if (value instanceof Date) {
        obj[header] = Utilities.formatDate(
          value,
          Session.getScriptTimeZone(),
          "yyyy-MM-dd'T'HH:mm:ss"
        );
      } else {
        obj[header] = value;
      }
    });

    rows.push(obj);
  }

  return rows;
}

function jsonOutput_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
