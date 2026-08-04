// ============================================================
// Shared media-upload API — ONE Web App used by every entry form
// (P1-P4) to upload "ก่อน/หลัง" photos to Google Drive instead of
// embedding them in the site itself. The site's own hosting/domain
// isn't finalized yet, so photo storage must not be tied to it —
// Drive stays valid no matter where the static HTML ends up hosted.
//
// This keeps Drive-upload code in exactly one place instead of
// duplicated across p1_api.gs/p2_api.gs/p3_api.gs/p4_api.gs — each
// of those only ever receives back a plain URL string and stores it
// in its own Sheet, same as any other form field.
//
// Deploy as its own Web App (Execute as: Me, Access: Anyone).
// Requires a valid staff session token (same USERS_SHEET_ID /
// sessions tab used by every other API here) — unlike news images,
// entry-form photos are uploaded by logged-in staff only, never by
// anonymous visitors.
// ============================================================

const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';
const MEDIA_ROOT_FOLDER_NAME = 'RayongFund_Uploads';
const MEDIA_MAX_BYTES = 5 * 1024 * 1024; // 5MB per file, same limit used for news images
const MEDIA_CONTEXT_FOLDERS = {
  p1: 'P1_ปรับสภาพบ้าน',
  p2: 'P2_ยืมอุปกรณ์',
  p3: 'P3_พัฒนาเครือข่าย',
  p4: 'P4_ซ่อมอุปกรณ์'
};

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const session = validateSession_(body.token);
    if (!session) return jsonOutput_({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนอัพโหลดไฟล์' });

    const action = String(body.action || 'upload').toLowerCase();
    if (action === 'upload') return handleMediaUpload_(session, body);
    return jsonOutput_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  return jsonOutput_({ ok: true, message: 'media_api พร้อมใช้งาน — อัพโหลดไฟล์ผ่าน POST เท่านั้น' });
}

function handleMediaUpload_(session, body) {
  const data = body.file_data;
  if (!data) return jsonOutput_({ ok: false, error: 'ไม่มีไฟล์แนบ' });

  const approxBytes = data.length * 0.75;
  if (approxBytes > MEDIA_MAX_BYTES) {
    return jsonOutput_({ ok: false, error: 'ไฟล์ "' + (body.filename || '') + '" ใหญ่เกินไป (จำกัด 5MB ต่อไฟล์)' });
  }

  const context = String(body.context || '').toLowerCase();
  const folderName = MEDIA_CONTEXT_FOLDERS[context];
  if (!folderName) return jsonOutput_({ ok: false, error: 'ไม่ระบุโครงการปลายทาง (context) ที่ถูกต้อง' });

  try {
    const root = getOrCreateFolder_(MEDIA_ROOT_FOLDER_NAME);
    const sub = getOrCreateFolder_(folderName, root);
    const bytes = Utilities.base64Decode(data);
    const blob = Utilities.newBlob(bytes, body.mime || 'application/octet-stream', body.filename || 'upload');
    const file = sub.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const url = 'https://drive.google.com/uc?export=view&id=' + file.getId();
    return jsonOutput_({ ok: true, url: url });
  } catch (err) {
    return jsonOutput_({ ok: false, error: 'อัพโหลดไม่สำเร็จ: ' + String(err) });
  }
}

function getOrCreateFolder_(name, parent) {
  const scope = parent || DriveApp;
  const folders = scope.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : scope.createFolder(name);
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
      if (expiresAt > now) return { email: row[1], role: row[2], district: row[3] };
      return null;
    }
  }
  return null;
}

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
