function doGet(e) {
  const action = (e.parameter.action || "devices").toString();

  try {
    let result;

    if (action === "devices") {
      result = getDevicesData();
    } else if (action === "user_groups") {
      result = getUserGroupsData();
    } else if (action === "funding") {
      result = getFundingData();
    } else if (action === "health") {
      result = {
        status: "ok",
        message: "P4 API is running",
        available_actions: ["devices", "user_groups", "funding", "health"]
      };
    } else {
      result = {
        status: "error",
        message: "Unknown action: " + action
      };
    }

    return jsonOutput(result);

  } catch (err) {
    return jsonOutput({
      status: "error",
      message: err.message,
      stack: err.stack
    });
  }
}

function getDevicesData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName("config_centers");

  if (!configSheet) {
    throw new Error("Missing sheet: config_centers");
  }

  const configs = sheetToObjects(configSheet)
    .filter(row =>
      String(row.active).toUpperCase() === "TRUE" &&
      String(row.type || "").trim() === "repair_center"
    );

  const allRows = [];

  configs.forEach(center => {
    const tabName = String(center.tab_name || "").trim();
    const sheet = ss.getSheetByName(tabName);

    if (!sheet) {
      allRows.push({
        source_error: true,
        center_name: center.center_name,
        tab_name: tabName,
        district: center.district,
        message: "Sheet not found"
      });
      return;
    }

    const rows = sheetToObjects(sheet);

    rows.forEach(row => {
      const itemName = pick(row, ["รายการ", "รายการ_อุปกรณ์", "ชื่อรายการ"]);
      if (!itemName) return;

      allRows.push({
        center_name: center.center_name,
        tab_name: tabName,
        district: center.district,

        category: pick(row, ["กลุ่ม", "กลุ่ม_อุปกรณ์ที่พร้อมให้บริการ"]),
        item: itemName,
        unit: pick(row, ["หน่วย", "อุปกรณ์_หน่วย"]),

        buy66: num(pick(row, ["จำนวนที่ซื้อ ปี 66", "จำนวนที่ซื้อ ปี66", "จัดซื้อ_ปี66"])),
        paid66: num(pick(row, ["จำนวนเบิกจ่าย ปี 66", "จำนวนเบิกจ่าย ปี66", "เบิกจ่าย_ปี66"])),
        balance66: num(pick(row, ["คงเหลือ ปี 66", "คงเหลือ ปี66", "ยอดสุทธิ_ปี66"])),

        buy67: num(pick(row, ["จำนวนที่ซื้อ ปี 67", "จำนวนที่ซื้อ ปี67", "จัดซื้อ_ปี67"])),
        paid67: num(pick(row, ["จำนวนเบิกจ่าย ปี 67", "จำนวนเบิกจ่าย ปี67", "เบิกจ่าย_ปี67"])),
        balance67: num(pick(row, ["คงเหลือ ปี 67", "คงเหลือ ปี67", "คงเหลือ ปี 67 (ก่อนเบิกจ่าย)", "ยอดสุทธิ_ปี67"])),

        buy68: num(pick(row, ["จำนวนที่ซื้อ ปี 68", "จำนวนที่ซื้อ ปี68", "จำนวนที่ซื้อ ปี 68 ระยะ 1", "จำนวนที่ซื้อ ปี68 ระยะ1", "จำนวนที่ซื้อ ปี 68 ระยะ 2", "จำนวนที่ซื้อ ปี68 ระยะ2", "จัดซื้อ_ปี68"])),
        balance68_before: num(pick(row, ["คงเหลือ ปี 68 (ก่อนเบิกจ่าย)", "คงเหลือ ปี68 (ก่อนเบิกจ่าย)", "รวมก่อนเบิก_ปี68_ระยะ1(ห้ามแก้ไข)"])),
        paid68: num(pick(row, ["จำนวนเบิกจ่าย ปี 68", "จำนวนเบิกจ่าย ปี68", "จำนวนเบิกจ่าย ปี 68 ระยะ 1", "จำนวนเบิกจ่าย ปี68 ระยะ1", "จำนวนเบิกจ่าย ปี 68 ระยะ 2", "จำนวนเบิกจ่าย ปี68 ระยะ2", "เบิกจ่าย_ปี68"])),
        balance68: num(pick(row, ["คงเหลือ ปี 68 (หลังเบิกจ่าย)", "คงเหลือ ปี68 (หลังเบิกจ่าย)", "ยอดสุทธิ_ปี68(ห้ามแก้ไข)", "ยอดคงเหลือ_ปี68_ระยะ1(ห้ามแก้ไข)"])),

        buy69: num(pick(row, ["จำนวนที่ซื้อ ปี 69", "จำนวนที่ซื้อ ปี69", "จัดซื้อ_ปี69"])),
        balance69_before: num(pick(row, ["คงเหลือ ปี 69 (ก่อนเบิกจ่าย)", "คงเหลือ ปี69 (ก่อนเบิกจ่าย)"])),
        paid69: num(pick(row, ["จำนวนเบิกจ่าย ปี 69", "จำนวนเบิกจ่าย ปี69", "เบิกจ่าย_ปี69"])),
        balance69: num(pick(row, ["คงเหลือ ปี 69 (หลังเบิกจ่าย)", "คงเหลือ ปี69 (หลังเบิกจ่าย)", "ยอดสุทธิ_ปี69(ห้ามแก้ไข)"]))
      });
    });
  });

  return {
    status: "ok",
    action: "devices",
    count: allRows.length,
    data: allRows
  };
}

function getUserGroupsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("กลุ่มผู้ใช้บริการ");

  if (!sheet) {
    throw new Error("Missing sheet: กลุ่มผู้ใช้บริการ");
  }

  const rows = sheetToObjects(sheet).map(row => ({
    district: pick(row, ["อำเภอ"]),
    center_name: pick(row, ["หน่วยงานที่ตั้งศูนย์ซ่อม", "หน่วยงาน_ที่ตั้งศูนย์ซ่อม"]),
    category: pick(row, ["กลุ่มอุปกรณ์ที่พร้อมให้บริการ", "กลุ่ม_อุปกรณ์ที่พร้อมให้บริการ"])
  }));

  return {
    status: "ok",
    action: "user_groups",
    count: rows.length,
    data: rows
  };
}

function getFundingData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("งบประมาณสนับสนุน");

  if (!sheet) {
    throw new Error("Missing sheet: งบประมาณสนับสนุน");
  }

  const rows = sheetToObjects(sheet).map(row => ({
    budget_year: pick(row, ["ปีงบประมาณ", "ปี_งบประมาณ"]),
    agency: pick(row, ["หน่วยงาน", "ชื่อ_หน่วยงาน"]),
    submit_date: pick(row, ["วันที่ส่งโครงการฯ", "วันที่_ส่งโครงการฯ"]),
    approve_date: pick(row, ["วันที่อนุมัติ", "วันที่_อนุมัติ"]),
    mou_date: pick(row, ["วันที่ทำ MOU", "วันที่_ทำMOU"]),
    check_date: pick(row, ["วันที่รับเช็ค", "วันที่_รับเช็ค"]),
    report_date: pick(row, ["วันที่ส่งรายงานผล", "วันที่_ส่งรายงานผล"]),
    budget: num(pick(row, ["จำนวนเงิน", "งบประมาณ_จำนวนเงิน", "งบประมาณ"])),
    remark: pick(row, ["หมายเหตุ"])
  }));

  return {
    status: "ok",
    action: "funding",
    count: rows.length,
    data: rows
  };
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();

  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(h => String(h).trim());

  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      if (header) {
        obj[header] = row[index];
      }
    });
    return obj;
  });
}

function pick(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }
  return "";
}

function num(value) {
  if (value === "" || value === null || value === undefined) return 0;
  if (typeof value === "number") return value;

  const cleaned = String(value).replace(/,/g, "").trim();
  const n = Number(cleaned);

  return isNaN(n) ? 0 : n;
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
