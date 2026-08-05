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

// ── Project 4 ────────────────────────────────────────────────────────────────
var P4_API_URL = 'https://script.google.com/macros/s/AKfycbycPZZSlTIBfPDscaGRxGXj06hhpj7rkRfehx_96GjJ694yteIjh5_AdnqCXNLhJFZGIA/exec';

function fetchProject4Data(action) {
  var url = P4_API_URL + '?action=' + encodeURIComponent(action);
  return fetch(url, { method: 'GET' })
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
}
