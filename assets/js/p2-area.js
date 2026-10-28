// P2 ศูนย์สาธิตและยืมอุปกรณ์ — every ตำบล in Rayong with its centre point,
// so the equipment search can (1) find units by ตำบล even when the viewer
// doesn't know which อำเภอ it's in, and (2) list units in nearby ตำบล.
//
// Centre points from OpenGISData-Thailand subdistricts.geojson
// (github.com/chingchai/OpenGISData-Thailand). ห้วยโป่ง is missing from that
// file and was added by hand at an approximate point.
// Distances are straight lines from the searched place to each unit's own
// map point (or its ตำบล centre when the unit has none) — a rough guide only,
// not driving distance.

var P2_TAMBON = [
  // [ตำบล, อำเภอ, lat, lon]
  // อ.เมืองระยอง
  ["กะเฉด", "เมืองระยอง", 12.7817, 101.4906],
  ["แกลง", "เมืองระยอง", 12.6635, 101.4664],
  ["เชิงเนิน", "เมืองระยอง", 12.6838, 101.3014],
  ["ตะพง", "เมืองระยอง", 12.6579, 101.3694],
  ["ทับมา", "เมืองระยอง", 12.7197, 101.2295],
  ["ท่าประดู่", "เมืองระยอง", 12.6744, 101.2664],
  ["นาตาขวัญ", "เมืองระยอง", 12.7373, 101.3691],
  ["น้ำคอก", "เมืองระยอง", 12.7204, 101.2614],
  ["เนินพระ", "เมืองระยอง", 12.6808, 101.2216],
  ["บ้านแลง", "เมืองระยอง", 12.707, 101.3761],
  ["เพ", "เมืองระยอง", 12.6192, 101.4226],
  ["มาบตาพุด", "เมืองระยอง", 12.7311, 101.1449],
  ["สำนักทอง", "เมืองระยอง", 12.756, 101.4495],
  ["ห้วยโป่ง", "เมืองระยอง", 12.71, 101.18],
  // อ.บ้านฉาง
  ["บ้านฉาง", "บ้านฉาง", 12.732, 101.0763],
  ["พลา", "บ้านฉาง", 12.6883, 101.0251],
  ["สำนักท้อน", "บ้านฉาง", 12.7636, 101.0345],
  // อ.แกลง
  ["กระแสบน", "แกลง", 12.8958, 101.609],
  ["กร่ำ", "แกลง", 12.6665, 101.6312],
  ["กองดิน", "แกลง", 12.813, 101.7962],
  ["คลองปูน", "แกลง", 12.7497, 101.7338],
  ["ชากโดน", "แกลง", 12.6995, 101.6041],
  ["ชากพง", "แกลง", 12.668, 101.5492],
  ["ทางเกวียน", "แกลง", 12.7912, 101.6352],
  ["ทุ่งควายกิน", "แกลง", 12.8098, 101.7274],
  ["เนินฆ้อ", "แกลง", 12.7123, 101.6531],
  ["บ้านนา", "แกลง", 12.8465, 101.6742],
  ["ปากน้ำกระแส", "แกลง", 12.7211, 101.708],
  ["พังราด", "แกลง", 12.7296, 101.7708],
  ["วังหว้า", "แกลง", 12.7851, 101.593],
  ["สองสลึง", "แกลง", 12.7458, 101.5476],
  ["ห้วยยาง", "แกลง", 12.7779, 101.5621],
  // อ.วังจันทร์
  ["ชุมแสง", "วังจันทร์", 12.9783, 101.5371],
  ["ป่ายุบใน", "วังจันทร์", 13.0114, 101.48],
  ["พลงตาเอี่ยม", "วังจันทร์", 12.9011, 101.54],
  ["วังจันทร์", "วังจันทร์", 12.8614, 101.5532],
  // อ.บ้านค่าย
  ["ชากบก", "บ้านค่าย", 12.7831, 101.3637],
  ["ตาขัน", "บ้านค่าย", 12.7341, 101.3161],
  ["บางบุตร", "บ้านค่าย", 12.8474, 101.3907],
  ["บ้านค่าย", "บ้านค่าย", 12.7751, 101.3036],
  ["หนองตะพาน", "บ้านค่าย", 12.7544, 101.2582],
  ["หนองบัว", "บ้านค่าย", 12.9055, 101.3729],
  ["หนองละลอก", "บ้านค่าย", 12.8257, 101.2619],
  // อ.ปลวกแดง
  ["ตาสิทธิ์", "ปลวกแดง", 13.0376, 101.2248],
  ["ปลวกแดง", "ปลวกแดง", 12.9781, 101.2264],
  ["มาบยางพร", "ปลวกแดง", 12.9699, 101.1363],
  ["แม่น้ำคู้", "ปลวกแดง", 12.9079, 101.23],
  ["ละหาร", "ปลวกแดง", 12.973, 101.3114],
  ["หนองไร่", "ปลวกแดง", 13.0145, 101.3484],
  // อ.เขาชะเมา
  ["เขาน้อย", "เขาชะเมา", 13.0623, 101.6173],
  ["ชำฆ้อ", "เขาชะเมา", 12.9417, 101.6439],
  ["น้ำเป็น", "เขาชะเมา", 12.9018, 101.7487],
  ["ห้วยทับมอญ", "เขาชะเมา", 13.0454, 101.6838],
  // อ.นิคมพัฒนา
  ["นิคมพัฒนา", "นิคมพัฒนา", 12.8427, 101.1782],
  ["พนานิคม", "นิคมพัฒนา", 12.9008, 101.1348],
  ["มะขามคู่", "นิคมพัฒนา", 12.848, 101.1015],
  ["มาบข่า", "นิคมพัฒนา", 12.7828, 101.193],
].map(function(r) { return { name: r[0], district: r[1], lat: r[2], lon: r[3] }; });

// Other spellings people type (the boundary file spells it "กระเฉด")
var P2_TAMBON_ALIAS = { 'กระเฉด': 'กะเฉด' };

// Units within this distance of the searched area count as "nearby"; if
// fewer than P2_NEARBY_MIN units are that close, the nearest ones are added.
var P2_NEARBY_KM  = 15;
var P2_NEARBY_MIN = 4;

function p2TambonFind(name, district) {
  name = P2_TAMBON_ALIAS[name] || name;
  for (var i = 0; i < P2_TAMBON.length; i++) {
    var t = P2_TAMBON[i];
    if (t.name === name && (!district || t.district === district)) return t;
  }
  return null;
}

// A search word that names a ตำบล ("เชิงเนิน", "ต.เชิงเนิน", "ตำบลเชิงเนิน").
// A bare word that is also an อำเภอ name ("แกลง", "บ้านฉาง") stays an อำเภอ
// search — type "ต.แกลง" for the ตำบล.
function p2TambonFromToken(tok) {
  tok = String(tok || '').replace(/\./g, '');
  // whole word first: "ตะพง" / "ตาขัน" start with ต but are names
  var t = p2TambonFind(tok);
  if (t && !P2_TAMBON.some(function(x) { return x.district === t.name; })) return t;
  var m = /^(?:ตำบล|ต)(.+)$/.exec(tok);
  return m ? p2TambonFind(m[1]) : null;
}

function p2DistrictCentre(district) {
  var ts = P2_TAMBON.filter(function(t) { return t.district === district; });
  if (!ts.length) return null;
  return { lat: ts.reduce(function(s, t) { return s + t.lat; }, 0) / ts.length,
           lon: ts.reduce(function(s, t) { return s + t.lon; }, 0) / ts.length };
}

// Where a service unit is: its own map point if the unit list has one,
// otherwise its ตำบล centre; its อำเภอ centre (approx) when the ตำบล in the
// data isn't a known Rayong ตำบล.
function p2UnitPlace(unitName) {
  var u = null;
  for (var i = 0; i < p2ServiceUnits.length; i++) {
    if (p2ServiceUnits[i].name === unitName) { u = p2ServiceUnits[i]; break; }
  }
  if (!u) {
    var s = (p2UnitSummary || []).filter(function(x) { return x.unit === unitName; })[0];
    if (!s) return null;
    u = { tambon: "", district: s.district };
  }
  var t = p2TambonFind(u.tambon, u.district);
  var tambon = t ? t.name : u.tambon;
  if (u.lat && u.lon) return { tambon: tambon, district: u.district, lat: u.lat, lon: u.lon };
  if (t) return { tambon: t.name, district: t.district, lat: t.lat, lon: t.lon };
  // only the อำเภอ is known — no km shown for it
  var c = p2DistrictCentre(u.district);
  return c ? { tambon: tambon, district: u.district, lat: c.lat, lon: c.lon, approx: true } : null;
}

function p2DistKm(a, b) {
  var R = 6371, rad = Math.PI / 180;
  var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Every unit around a ตำบล → { unitName: { km, near } }. near=false means
// the unit is inside that ตำบล itself (or is one of `ownUnits`).
function p2AreaUnits(centre, tambon, ownUnits) {
  ownUnits = ownUnits || [];
  var all = (p2UnitsList || []).map(function(name) {
    var p = p2UnitPlace(name);
    return p ? { name: name, km: p2DistKm(centre, p), approx: !!p.approx,
                 own: ownUnits.indexOf(name) > -1 || (!!tambon && p.tambon === tambon.name && p.district === tambon.district) } : null;
  }).filter(Boolean).sort(function(a, b) { return a.km - b.km; });
  var out = {}, nearCount = 0;
  all.forEach(function(x) {
    if (x.own) { out[x.name] = { km: 0, near: false }; return; }
    if (x.km <= P2_NEARBY_KM || nearCount < P2_NEARBY_MIN) { out[x.name] = { km: x.km, near: true, approx: x.approx }; nearCount++; }
  });
  return out;
}

// Normally a unit lends only inside its own area; these places lend to
// anyone in Rayong. Shown in the note above the nearby-area cards.
var P2_OPEN_LENDERS = [
  { name: 'วัดกระบกขึ้นผึ้ง', where: 'ต.บ้านค่าย อ.บ้านค่าย', note: 'ศูนย์ซ่อมฯ ที่ได้รับงบสนับสนุนจากกองทุน',
    contact: 'คุณประสิทธิ์', phone: '087-8339284',
    map: 'https://maps.app.goo.gl/xPTzdvdHSndf2YveA', lat: 12.78925, lon: 101.31179 }
];
