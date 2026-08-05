// Form Edit History & Permission Management
// จัดการประวัติการแก้ไข และสิทธิ์การแก้ไขตามเวลา

/**
 * ตรวจสอบว่า entry สามารถแก้ไขได้หรือไม่
 * - Staff: แก้ไขได้เฉพาะ 7 วันแรก (นับจาก created_date)
 * - Admin/Executive: แก้ไขได้เสมอ
 * @param {object} entry - Entry record
 * @param {object} session - User session
 * @returns {object} { canEdit: boolean, reason: string }
 */
function checkEditPermission(entry, session) {
  if (!session || !session.role) {
    return { canEdit: false, reason: 'ต้องเข้าสู่ระบบก่อน' };
  }

  // Admin/Executive สามารถแก้ไขได้เสมอ
  if (session.role === 'admin' || session.role === 'executive') {
    return { canEdit: true, reason: '' };
  }

  // Staff: ตรวจสอบ 7-day window
  if (session.role === 'staff') {
    if (!entry || !entry.timestamp) {
      return { canEdit: true, reason: '' }; // ถ้าไม่มี timestamp ให้แก้ได้
    }

    var createdDate = new Date(entry.timestamp);
    var daysAgo = Math.floor((new Date() - createdDate) / (1000 * 60 * 60 * 24));

    if (daysAgo <= 7) {
      return { canEdit: true, reason: '' };
    } else {
      return {
        canEdit: false,
        reason: 'สามารถแก้ไขได้เฉพาะ 7 วันแรก (เข้าสู่ระบบเมื่อ ' +
                createdDate.toLocaleDateString('th-TH') + ') ' +
                'กรุณาติดต่อผู้ดูแลระบบ'
      };
    }
  }

  return { canEdit: false, reason: 'ไม่มีสิทธิ์แก้ไข' };
}

/**
 * แสดง History tab ใน entry form
 * โดยจำเป็นต้อง API call เพื่อดึง version history
 * @param {string} projectId - P1, P2, P3, P4
 * @param {number} entryId - ID ของ entry
 * @param {string} apiUrl - Base API URL
 */
function loadEditHistory(projectId, entryId, apiUrl) {
  var historyContainer = document.getElementById('historyContainer');
  if (!historyContainer) return;

  var session = null;
  try { session = JSON.parse(localStorage.getItem('rf_user') || 'null'); } catch (e) {}

  if (!session || !session.token) {
    historyContainer.innerHTML = '<div style="padding:1rem;color:#94a3b8;">ต้องเข้าสู่ระบบเพื่อดูประวัติ</div>';
    return;
  }

  historyContainer.innerHTML = '<div style="padding:1rem;text-align:center;color:#94a3b8;">กำลังโหลดประวัติ...</div>';

  // Call API เพื่อดึง history
  // NOTE: Backend ต้อง implement endpoint นี้
  var url = apiUrl + '?action=get_edit_history&project=' + projectId +
            '&id=' + entryId + '&token=' + encodeURIComponent(session.token);

  fetch(url)
    .then(function(r) { return r.json(); })
    .then(function(json) {
      if (!json.ok) {
        historyContainer.innerHTML = '<div style="padding:1rem;color:#94a3b8;">ไม่พบประวัติแก้ไข หรือยังไม่มีสิทธิ์ดู</div>';
        return;
      }

      var history = json.history || [];
      if (history.length === 0) {
        historyContainer.innerHTML = '<div style="padding:1rem;color:#94a3b8;">ยังไม่มีประวัติการแก้ไข</div>';
        return;
      }

      var html = '<div style="font-size:0.85rem;">';
      history.reverse().forEach(function(change, idx) {
        var datetime = new Date(change.timestamp).toLocaleString('th-TH', {
          year: 'numeric', month: 'short', day: 'numeric',
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        var isLatest = (idx === 0);

        html += '<div style="border-left:2px solid ' + (isLatest ? '#10b981' : '#e2e8f0') +
                ';padding:0.75rem 1rem;margin:0 0 0.5rem;' +
                (isLatest ? 'background:#f0fdf4;' : 'background:#f8fafc;') +
                'border-radius:6px;">' +
                '<div style="font-weight:700;color:#0f172a;">' +
                (change.edited_by || 'ไม่ทราบ') +
                (isLatest ? ' <span style="background:#10b981;color:#fff;font-size:0.7rem;padding:0.15rem 0.4rem;border-radius:4px;">ล่าสุด</span>' : '') +
                '</div>' +
                '<div style="font-size:0.75rem;color:#94a3b8;margin:0.25rem 0;">' + datetime + '</div>';

        if (change.field_changes) {
          html += '<div style="margin:0.5rem 0;font-size:0.8rem;">';
          change.field_changes.forEach(function(fc) {
            html += '<div style="color:#475569;margin:0.25rem 0;">' +
                    '📝 <strong>' + fc.field + '</strong>: ' +
                    '<span style="color:#94a3b8;text-decoration:line-through;">' + (fc.old_value || '-') + '</span> ' +
                    '→ ' +
                    '<span style="color:#10b981;font-weight:600;">' + (fc.new_value || '-') + '</span>' +
                    '</div>';
          });
          html += '</div>';
        }

        if (change.notes) {
          html += '<div style="color:#475569;font-size:0.8rem;font-style:italic;">💬 ' + change.notes + '</div>';
        }

        html += '</div>';
      });
      html += '</div>';

      historyContainer.innerHTML = html;
    })
    .catch(function(err) {
      historyContainer.innerHTML = '<div style="padding:1rem;color:#dc2626;">⚠️ โหลดประวัติไม่สำเร็จ</div>';
      console.error('Load history error:', err);
    });
}

/**
 * ตรวจสอบและแสดง edit restriction banner
 * @param {object} entry - Entry record
 * @param {string} saveButtonId - ID ของ submit button
 */
function applyEditRestriction(entry, saveButtonId) {
  var session = null;
  try { session = JSON.parse(localStorage.getItem('rf_user') || 'null'); } catch (e) {}

  var permission = checkEditPermission(entry, session);
  var saveBtn = document.getElementById(saveButtonId);
  if (!saveBtn) return;

  if (!permission.canEdit) {
    // Disable button + show message
    saveBtn.disabled = true;
    saveBtn.style.opacity = '0.5';
    saveBtn.style.cursor = 'not-allowed';
    saveBtn.title = permission.reason;

    // แสดง warning banner
    var banner = document.createElement('div');
    banner.style.cssText = 'background:#fef3c7;border:1px solid #fde68a;color:#92400e;padding:1rem;' +
                            'border-radius:8px;margin-bottom:1rem;font-size:0.85rem;';
    banner.innerHTML = '⏰ <strong>หมดเวลาแก้ไข</strong><br>' + permission.reason;

    var form = saveBtn.closest('form');
    if (form) {
      form.insertAdjacentElement('afterbegin', banner);
    }
  } else {
    saveBtn.disabled = false;
    saveBtn.style.opacity = '1';
    saveBtn.style.cursor = 'pointer';
  }
}

/**
 * ค้นหา entry ล่าสุดของผู้ใช้ในตารางข้อมูล
 * @param {string} tableId - ID ของตาราง
 * @param {string} userEmail - Email ของผู้ใช้
 * @returns {object} Entry object หรือ null
 */
function findLatestUserEntry(tableId, userEmail) {
  var table = document.getElementById(tableId);
  if (!table) return null;

  var rows = table.getElementsByTagName('tr');
  var latestEntry = null;
  var latestDate = null;

  for (var i = 1; i < rows.length; i++) { // Skip header
    var cells = rows[i].getElementsByTagName('td');
    if (cells.length < 2) continue;

    var name = cells[0]?.textContent || '';
    var timestamp = rows[i].getAttribute('data-timestamp');

    // ค้นหา row ของผู้ใช้คนนี้
    if (userEmail && !rows[i].innerHTML.toLowerCase().includes(userEmail)) continue;

    if (timestamp) {
      var date = new Date(timestamp);
      if (!latestDate || date > latestDate) {
        latestDate = date;
        latestEntry = {
          name: name,
          timestamp: timestamp,
          rowIndex: i
        };
      }
    }
  }

  return latestEntry;
}
