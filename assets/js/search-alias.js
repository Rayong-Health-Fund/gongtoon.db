// Alias/Synonym mapping สำหรับการค้นหา
// เมื่อ user ค้นหา keyword ใดๆ ก็จะค้นหา alias ทั้งหมดด้วย

var SEARCH_ALIASES = {
  // อุปกรณ์พิการ
  'รถเข็น': ['รถเข็นพิการ', 'รถเข็นไฟฟ้า', 'wheelchair', 'electric wheelchair'],
  'แขนเทียม': ['ขาเทียม', 'prosthetic', 'artificial limb'],
  'ทำนายการไหลเวียนเลือด': ['อพยพแนวหน้า', 'วัสดุช่วยเรียนรู้'],
  'แว่นตา': ['คอนแทคเลนส์', 'แว่นแสง', 'glasses', 'contact lens'],
  'หูฟัง': ['เครื่องช่วยฟัง', 'hearing aid', 'earphone'],
  'เท้าเทียม': ['ขาเทียม', 'prosthetic foot', 'artificial leg'],
  'อุปกรณ์ช่วยเดิน': ['ไม้เท้า', 'walker', 'crutch', 'cane'],
  'เบาะรองนั่ง': ['cushion', 'pressure relieving cushion'],

  // บุคคล/ประเภท
  'ผู้พิการ': ['disability', 'disabled', 'person with disability'],
  'ผู้สูงอายุ': ['elderly', 'senior', 'aged'],
  'ผู้บ้านหลังพิการ': ['rural disability'],

  // สถานที่/หน่วยงาน
  'รพสต': ['สถานีอนามัย', 'health center', 'primary health care'],
  'โรงพยาบาล': ['hospital', 'รพ'],
  'สสอ': ['สำนักงานสถิติจังหวัด', 'สสจ', 'provincial office'],

  // สถานะ/สภาวะ
  'เสร็จสิ้น': ['completed', 'complete', 'done', 'finished'],
  'กำลังดำเนินการ': ['in progress', 'ongoing', 'pending'],
  'ยังไม่เริ่ม': ['not started', 'pending start'],

  // ธรรมชาติ/พื้นที่
  'อำเภอ': ['district', 'ำเภอ'],
  'ตำบล': ['sub-district', 'tambon', 'subdistrict'],
  'จังหวัด': ['province', 'jangwat'],

  // งบประมาณ/เงิน
  'งบประมาณ': ['budget', 'เงิน', 'funds'],
  'ล้านบาท': ['million baht', 'M', 'million'],
  'บาท': ['baht', 'THB', 'bath'],
};

/**
 * ค้นหา query ใน alias mapping
 * @param {string} query - ค่าที่ user พิมพ์
 * @returns {array} - array ของ keywords ทั้งหมดที่ตรง (รวม alias)
 */
function expandSearchQuery(query) {
  if (!query) return [];

  query = query.toLowerCase().trim();
  var keywords = [query]; // เพิ่ม query ต้นฉบับเสมอ

  // ค้นหาคำที่ไม่ตรงกันที่ 100% (partial match)
  for (var key in SEARCH_ALIASES) {
    var lowerKey = key.toLowerCase();
    var aliases = SEARCH_ALIASES[key];

    // ถ้า query ตรงกับ key หรือ key ตรงกับ query
    if (lowerKey.indexOf(query) !== -1 || query.indexOf(lowerKey) !== -1) {
      keywords.push(key.toLowerCase());
      aliases.forEach(function(alias) {
        if (keywords.indexOf(alias.toLowerCase()) === -1) {
          keywords.push(alias.toLowerCase());
        }
      });
    }

    // ถ้า query ตรงกับ alias ใดๆ
    aliases.forEach(function(alias) {
      var lowerAlias = alias.toLowerCase();
      if (lowerAlias.indexOf(query) !== -1 || query.indexOf(lowerAlias) !== -1) {
        if (keywords.indexOf(lowerKey) === -1) keywords.push(lowerKey);
        if (keywords.indexOf(lowerAlias) === -1) keywords.push(lowerAlias);
      }
    });
  }

  return keywords;
}

/**
 * เช็คว่า text ตรงกับ query หรือ alias หรือไม่
 * @param {string} text - ข้อความที่จะค้นหา
 * @param {string} query - query ที่ user พิมพ์
 * @returns {boolean}
 */
function matchesSearchQuery(text, query) {
  if (!text || !query) return false;

  var lowerText = text.toLowerCase();
  var keywords = expandSearchQuery(query);

  // ตรวจสอบ ถ้า text ตรงกับ keyword ใด (partial match)
  return keywords.some(function(keyword) {
    return lowerText.indexOf(keyword) !== -1;
  });
}

/**
 * ค้นหา text ใน array ของ columns/fields
 * @param {string} text - ข้อความทั้งหมดจาก row
 * @param {array} fields - array ของ field values
 * @param {string} query - query ที่ user พิมพ์
 * @returns {boolean}
 */
function searchInFields(fields, query) {
  if (!query) return true;
  if (!fields || fields.length === 0) return false;

  return fields.some(function(field) {
    return matchesSearchQuery(String(field), query);
  });
}
