// Optional photo attachments for the report forms (report-*.html).
//
// Markup:  <div id="photoBox"></div>
// Script:  var photos = ReportPhotos.attach(document.getElementById('photoBox'), { max: 5, onChange: fn });
//          (optional maxSide / quality, e.g. { maxSide: 2200, quality: 0.85 } for document photos)
//          photos.list()  -> [{ type: 'image/jpeg', data: '<base64>' }]  (ready to send)
//          photos.clear()
//
// Picking uses the phone's normal chooser, so staff can take a new photo or pick
// from the album. Each photo is shrunk in the browser (longest side 1600px, JPEG)
// before it is kept, so a 5 MB phone photo goes up as ~300 KB.
(function () {
  var MAX_SIDE = 1600;
  var QUALITY = 0.8;

  function shrink(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        var canvas = document.createElement('canvas');
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('เปิดไฟล์รูปไม่ได้')); };
      img.src = url;
    });
  }

  function attach(box, opts) {
    var max = (opts && opts.max) || 5;
    var onChange = (opts && opts.onChange) || function () {};
    // documents (e.g. a handwritten job sheet) keep more detail so they stay readable
    var maxSide = (opts && opts.maxSide) || MAX_SIDE;
    var quality = (opts && opts.quality) || QUALITY;
    var items = []; // data URLs
    var busy = 0;
    var id = 'rp' + Math.random().toString(36).slice(2, 8);

    box.innerHTML =
      '<div class="rf-photos-grid"></div>' +
      '<label class="rf-btn ghost rf-photos-add" for="' + id + '">📷 เพิ่มรูป</label>' +
      '<input type="file" id="' + id + '" accept="image/*" multiple class="rf-hp">' +
      '<div class="rf-photos-info"></div>';
    var grid = box.querySelector('.rf-photos-grid');
    var input = box.querySelector('input');
    var addBtn = box.querySelector('.rf-photos-add');
    var info = box.querySelector('.rf-photos-info');

    function render(msg) {
      grid.innerHTML = items.map(function (src, i) {
        return '<div class="rf-photo"><img src="' + src + '" alt="รูปที่ ' + (i + 1) + '">' +
          '<button type="button" data-i="' + i + '" aria-label="ลบรูปที่ ' + (i + 1) + '">✕</button></div>';
      }).join('') + (busy ? '<div class="rf-photo rf-photo-busy">กำลังเตรียมรูป…</div>' : '');
      addBtn.classList.toggle('rf-hidden', items.length + busy >= max);
      info.innerHTML = msg ? '<span class="rf-photos-err">' + msg + '</span>'
        : 'แนบแล้ว ' + items.length + '/' + max + ' รูป · ถ่ายใหม่หรือเลือกจากอัลบั้มก็ได้';
      onChange(items.length);
    }

    grid.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-i]');
      if (!b) return;
      items.splice(Number(b.getAttribute('data-i')), 1);
      render();
    });

    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      var room = max - items.length - busy;
      var msg = files.length > room ? 'แนบได้สูงสุด ' + max + ' รูป ระบบเลือกไว้ ' + room + ' รูปแรก' : '';
      files.slice(0, Math.max(0, room)).forEach(function (f) {
        if (!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)) { msg = 'ไฟล์ ' + f.name + ' ไม่ใช่รูปภาพ'; return; }
        busy++;
        shrink(f, maxSide, quality).then(function (src) { items.push(src); }, function (err) { msg = f.name + ': ' + err.message; })
          .then(function () { busy--; render(msg); });
      });
      render(msg);
    });

    render();
    return {
      list: function () {
        return items.map(function (src) { return { type: 'image/jpeg', data: src.split(',')[1] }; });
      },
      count: function () { return items.length; },
      busy: function () { return busy > 0; },
      clear: function () { items = []; render(); }
    };
  }

  window.ReportPhotos = { attach: attach };
})();
