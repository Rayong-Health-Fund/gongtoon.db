var P1_API_URL = 'https://script.google.com/macros/s/AKfycbwrfd-XjqDtyoVSb3SzBZGmvW2FoO5NL_stcoOMJcsAJFKWkCcuep6rf1irMnQ57P4o/exec';

function fetchProject1Data(tabName) {
  var url = P1_API_URL + '?tab=' + encodeURIComponent(tabName);
  return fetch(url, { method: 'GET' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
}

// ── Project 2 ────────────────────────────────────────────────────────────────
var P2_API_URL = 'https://script.google.com/macros/s/AKfycbyIaic0H6HgSjUMS1KkEflEnEjY5_vtf11AwApo1sFpvPwY2_eaKB3VrpogR3mBLUzssQ/exec';

function fetchProject2Data(tabName) {
  var url = P2_API_URL + '?tab=' + encodeURIComponent(tabName);
  return fetch(url, { method: 'GET' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
}
