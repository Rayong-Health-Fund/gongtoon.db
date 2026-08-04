// ============================================================
// News / announcements API — standalone script, NOT bound to any
// spreadsheet. Reads/writes a "news" tab inside the same shared
// Users/membership spreadsheet (USERS_SHEET_ID) that already holds
// users + sessions, so no new spreadsheet has to be created.
//
// Deploy this as its own Web App (Execute as: Me, Access: Anyone).
// One-time setup: after deploying, visit YOUR_EXEC_URL?action=setup once
// in a browser (or run setupNewsSheet_() from the Apps Script editor) to
// create the "news" tab with the right headers.
// ============================================================

const USERS_SHEET_ID = '1YMj6y9jIA63gh_y1LGYzJ0wcSI1eE9ssmE5vUrv1tzY';
const NEWS_SHEET_NAME = 'news';
const NEWS_HEADERS = [
  'id', 'title', 'body', 'category', 'status',
  'publish_date', 'expire_date', 'pinned',
  'image_url', 'video_url',
  'created_at', 'updated_at', 'created_by'
];
const NEWS_IMAGE_FOLDER_NAME = 'RayongFund_News_Images';
const NEWS_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB, same limit used elsewhere on the site

// Safe to re-run: creates the tab if missing, or adds any headers that
// aren't there yet (e.g. publish_date/expire_date/pinned added later)
// without touching existing columns/rows.
function ensureNewsSheetSetup_() {
  const ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  let sheet = ss.getSheetByName(NEWS_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(NEWS_SHEET_NAME);

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(NEWS_HEADERS);
    sheet.setFrozenRows(1);
  } else {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function(h) { return String(h).trim(); });
    const missing = NEWS_HEADERS.filter(function(h) { return existing.indexOf(h) === -1; });
    missing.forEach(function(h) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(h);
    });
  }
  return sheet;
}

// Menu/manual-run entry point — SpreadsheetApp.getUi() only works when a
// human runs this from the Apps Script editor, never from a Web App
// request, which is why doGet's "setup" action below calls
// ensureNewsSheetSetup_() directly instead of this wrapper.
function setupNewsSheet_() {
  ensureNewsSheetSetup_();
  SpreadsheetApp.getUi().alert('พร้อมใช้งานแท็บ "news" แล้ว');
}

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = String(params.action || 'list').toLowerCase();

    if (action === 'setup') {
      ensureNewsSheetSetup_();
      return jsonOutput_({ ok: true, message: 'พร้อมใช้งานแท็บ "news" แล้ว — เปิดไฟล์ news.html ได้เลย' });
    }

    if (action === 'list_all') {
      const session = validateSession_(params.token);
      if (!session || session.role !== 'admin') {
        return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ (admin) เท่านั้นที่ดูข่าวทั้งหมด (รวมฉบับร่าง) ได้' });
      }
      return jsonOutput_({ ok: true, news: getAllNews_() });
    }

    // Default: public list — published, and not past its expire_date (if set).
    const all = getAllNews_();
    const now = new Date();
    const published = all.filter(function(n) {
      if (n.status !== 'published') return false;
      if (n.expire_date && new Date(n.expire_date) < now) return false;
      return true;
    });
    return jsonOutput_({ ok: true, news: published });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const session = validateSession_(body.token);
    if (!session || session.role !== 'admin') {
      return jsonOutput_({ ok: false, error: 'เฉพาะกองทุนฯ (admin) เท่านั้นที่จัดการข่าวได้' });
    }

    const action = String(body.action || '').toLowerCase();
    if (action === 'create') return handleNewsCreate_(session, body);
    if (action === 'update') return handleNewsUpdate_(session, body);
    if (action === 'delete') return handleNewsDelete_(session, body);
    return jsonOutput_({ ok: false, error: 'ไม่รู้จัก action: ' + action });
  } catch (err) {
    return jsonOutput_({ ok: false, error: String(err) });
  }
}

// Uploads a base64-encoded image to a dedicated Drive folder, shares it
// "anyone with the link can view" (news is public content, so this
// matches the visibility the article itself already has), and returns a
// URL usable directly in an <img src>. Throws on anything too large or
// clearly not an image — caller is expected to catch.
function uploadNewsImage_(base64Data, filename, mimeType) {
  if (!base64Data) return '';
  const approxBytes = base64Data.length * 0.75;
  if (approxBytes > NEWS_IMAGE_MAX_BYTES) {
    throw new Error('ไฟล์รูปใหญ่เกินไป (จำกัด 5MB ต่อไฟล์)');
  }
  if (mimeType && mimeType.indexOf('image/') !== 0) {
    throw new Error('ไฟล์ที่แนบต้องเป็นรูปภาพเท่านั้น');
  }

  const folders = DriveApp.getFoldersByName(NEWS_IMAGE_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(NEWS_IMAGE_FOLDER_NAME);

  const bytes = Utilities.base64Decode(base64Data);
  const blob = Utilities.newBlob(bytes, mimeType || 'image/jpeg', filename || 'news-image');
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return 'https://drive.google.com/uc?export=view&id=' + file.getId();
}

function handleNewsCreate_(session, body) {
  const title = String(body.title || '').trim();
  const text  = String(body.body || '').trim();
  if (!title || !text) {
    return jsonOutput_({ ok: false, error: 'กรุณากรอกหัวข้อและเนื้อหาข่าว' });
  }

  const sheet = getNewsSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });

  const now = new Date();
  const id = 'news-' + Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMMdd-HHmmss');
  const status = (body.status === 'draft') ? 'draft' : 'published';
  // publish_date defaults to today if not given — this is the date shown
  // on the public page, editable so a real event/announcement date can
  // be used instead of "whenever it happened to be typed in".
  const publishDate = String(body.publish_date || '').trim() || Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM-dd');

  let imageUrl = '';
  if (body.image_data) {
    try {
      imageUrl = uploadNewsImage_(body.image_data, body.image_filename, body.image_mime);
    } catch (imgErr) {
      return jsonOutput_({ ok: false, error: String(imgErr) });
    }
  }

  const rowObj = {
    id: id,
    title: title,
    body: text,
    category: String(body.category || '').trim(),
    status: status,
    publish_date: publishDate,
    expire_date: String(body.expire_date || '').trim(),
    pinned: body.pinned ? 'TRUE' : 'FALSE',
    image_url: imageUrl,
    video_url: String(body.video_url || '').trim(),
    created_at: now,
    updated_at: now,
    created_by: session.email
  };

  const newRow = headers.map(function(h) {
    return Object.prototype.hasOwnProperty.call(rowObj, h) ? rowObj[h] : '';
  });
  sheet.appendRow(newRow);

  return jsonOutput_({ ok: true, id: id, image_url: imageUrl });
}

function handleNewsUpdate_(session, body) {
  const id = String(body.id || '').trim();
  if (!id) return jsonOutput_({ ok: false, error: 'ไม่พบ id ของข่าว' });

  const sheet = getNewsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const idCol = headers.indexOf('id');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === id) {
      const row = i + 1;
      if (body.title !== undefined) sheet.getRange(row, headers.indexOf('title') + 1).setValue(String(body.title).trim());
      if (body.body !== undefined) sheet.getRange(row, headers.indexOf('body') + 1).setValue(String(body.body).trim());
      if (body.category !== undefined) sheet.getRange(row, headers.indexOf('category') + 1).setValue(String(body.category).trim());
      if (body.status !== undefined) sheet.getRange(row, headers.indexOf('status') + 1).setValue(body.status === 'draft' ? 'draft' : 'published');
      if (body.publish_date !== undefined && headers.indexOf('publish_date') !== -1) sheet.getRange(row, headers.indexOf('publish_date') + 1).setValue(String(body.publish_date).trim());
      if (body.expire_date !== undefined && headers.indexOf('expire_date') !== -1) sheet.getRange(row, headers.indexOf('expire_date') + 1).setValue(String(body.expire_date).trim());
      if (body.pinned !== undefined && headers.indexOf('pinned') !== -1) sheet.getRange(row, headers.indexOf('pinned') + 1).setValue(body.pinned ? 'TRUE' : 'FALSE');
      if (body.video_url !== undefined && headers.indexOf('video_url') !== -1) sheet.getRange(row, headers.indexOf('video_url') + 1).setValue(String(body.video_url).trim());

      if (body.image_data && headers.indexOf('image_url') !== -1) {
        let newImageUrl;
        try {
          newImageUrl = uploadNewsImage_(body.image_data, body.image_filename, body.image_mime);
        } catch (imgErr) {
          return jsonOutput_({ ok: false, error: String(imgErr) });
        }
        sheet.getRange(row, headers.indexOf('image_url') + 1).setValue(newImageUrl);
      } else if (body.remove_image && headers.indexOf('image_url') !== -1) {
        sheet.getRange(row, headers.indexOf('image_url') + 1).setValue('');
      }

      sheet.getRange(row, headers.indexOf('updated_at') + 1).setValue(new Date());
      return jsonOutput_({ ok: true, id: id });
    }
  }
  return jsonOutput_({ ok: false, error: 'ไม่พบข่าวที่ id นี้' });
}

function handleNewsDelete_(session, body) {
  const id = String(body.id || '').trim();
  if (!id) return jsonOutput_({ ok: false, error: 'ไม่พบ id ของข่าว' });

  const sheet = getNewsSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function(h) { return String(h).trim(); });
  const idCol = headers.indexOf('id');
  const statusCol = headers.indexOf('status');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === id) {
      // Soft delete only — never destructively remove rows.
      sheet.getRange(i + 1, statusCol + 1).setValue('deleted');
      sheet.getRange(i + 1, headers.indexOf('updated_at') + 1).setValue(new Date());
      return jsonOutput_({ ok: true, id: id });
    }
  }
  return jsonOutput_({ ok: false, error: 'ไม่พบข่าวที่ id นี้' });
}

function getNewsSheet_() {
  const ss = SpreadsheetApp.openById(USERS_SHEET_ID);
  const sheet = ss.getSheetByName(NEWS_SHEET_NAME);
  if (!sheet) throw new Error('ไม่พบแท็บ "news" — กรุณารัน setupNewsSheet_() ก่อน 1 ครั้ง');
  return sheet;
}

function getAllNews_() {
  const sheet = getNewsSheet_();
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const headers = values[0].map(function(h) { return String(h).trim(); });
  const colIndex = {};
  headers.forEach(function(h, i) { colIndex[h] = i; });

  const items = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const status = String(row[colIndex['status']] || '').trim();
    if (!status || status === 'deleted') continue;
    items.push({
      id: row[colIndex['id']],
      title: row[colIndex['title']],
      body: row[colIndex['body']],
      category: row[colIndex['category']],
      status: status,
      publish_date: colIndex['publish_date'] !== undefined ? row[colIndex['publish_date']] : '',
      expire_date: colIndex['expire_date'] !== undefined ? row[colIndex['expire_date']] : '',
      pinned: colIndex['pinned'] !== undefined ? String(row[colIndex['pinned']]).toUpperCase() === 'TRUE' : false,
      image_url: colIndex['image_url'] !== undefined ? row[colIndex['image_url']] : '',
      video_url: colIndex['video_url'] !== undefined ? row[colIndex['video_url']] : '',
      created_at: row[colIndex['created_at']],
      updated_at: row[colIndex['updated_at']],
      created_by: row[colIndex['created_by']]
    });
  }
  items.sort(function(a, b) {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    var dateA = a.publish_date || a.created_at;
    var dateB = b.publish_date || b.created_at;
    return new Date(dateB) - new Date(dateA);
  });
  return items;
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

function jsonOutput_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
