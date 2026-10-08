// Shared site header for every public page. A page includes
//   <link rel="stylesheet" href="assets/css/site-nav.css">
//   <div id="siteNav"></div>
//   <script src="assets/js/site-nav.js"></script>
// and gets the same navbar (PC) and side panel (phone) as every other page,
// so the menu only ever has to be edited here.
(function () {
  var LINKS = [
    { href: 'index.html', icon: '🏠', label: 'หน้าหลัก', desc: 'ภาพรวมทุกโครงการ' },
    { href: 'project-summary.html', icon: '📊', label: 'สรุปโครงการ', desc: 'สรุปหน้าเดียว พิมพ์ได้' },
    { href: 'documents-download.html', icon: '📄', label: 'ดาวโหลดเอกสาร', desc: 'หลักเกณฑ์และเอกสารประกอบ' }
  ];
  var ABOUT = [
    { href: 'about.html#history', label: '📜 ประวัติความเป็นมา' },
    { href: 'about.html#mission', label: '🎯 วิสัยทัศน์ พันธกิจ ยุทธศาสตร์' },
    { href: 'about.html#structure', label: '🏛️ โครงสร้างการบริหาร' },
    { href: 'about.html#projects', label: '📋 โครงการที่ดำเนินการ' },
    { href: 'about.html#contact', label: '📞 ติดต่อกองทุนฯ' }
  ];

  var mount = document.getElementById('siteNav');
  if (!mount) return;
  // Compare without ".html" — some hosts serve /about for about.html.
  function bare(p) { return (p || '').toLowerCase().replace(/\.html$/, '') || 'index'; }
  var page = bare(location.pathname.split('/').pop());
  function isActive(href) { return bare(href.split('#')[0]) === page; }

  var brand = '<a class="sn-brand" href="index.html"><img src="assets/img/logo.jpg" alt="โลโก้กองทุน">' +
    '<span><b>กองทุนหลักประกันสุขภาพ</b><small>จังหวัดระยอง</small></span></a>';

  var desktop = '<ul class="sn-links">' + LINKS.map(function (l) {
    return '<li><a href="' + l.href + '"' + (isActive(l.href) ? ' class="active" aria-current="page"' : '') + '>' +
      l.icon + ' ' + l.label + '</a></li>';
  }).join('') +
    '<li><button type="button" class="sn-about-btn" aria-expanded="false"' + (page === 'about' ?' style="color:#0f766e"' : '') +
    '>ℹ️ เกี่ยวกับกองทุน ▾</button><div class="sn-sub">' +
    ABOUT.map(function (a) { return '<a href="' + a.href + '">' + a.label + '</a>'; }).join('') +
    '</div></li></ul>';

  var drawer = '<div class="sn-backdrop"></div><aside class="sn-drawer" aria-label="เมนู" aria-hidden="true">' +
    '<div class="sn-drawer-head"><img src="assets/img/logo.jpg" alt=""><b>กองทุนหลักประกันสุขภาพ<br>จังหวัดระยอง</b>' +
    '<button type="button" class="sn-close" aria-label="ปิดเมนู">✕</button></div><nav>' +
    LINKS.map(function (l) {
      return '<a href="' + l.href + '"' + (isActive(l.href) ? ' class="active"' : '') + '><span class="i">' + l.icon +
        '</span><span>' + l.label + '<small>' + l.desc + '</small></span></a>';
    }).join('') +
    '<div class="sn-group">เกี่ยวกับกองทุน</div>' +
    ABOUT.map(function (a) { return '<a class="sn-small" href="' + a.href + '">' + a.label + '</a>'; }).join('') +
    '</nav><div class="sn-contact">📞 โทร <a href="tel:038617430">038-617-430</a> ต่อ 203<br>💬 Line: 095-819-0720</div></aside>';

  mount.outerHTML = '<header class="sn-bar"><div class="sn-inner">' + brand + desktop +
    '<button type="button" class="sn-menu-btn" aria-label="เปิดเมนู"><span class="sn-burger">☰</span> เมนู</button>' +
    '</div></header>' + drawer;

  var body = document.body;
  var drawerEl = document.querySelector('.sn-drawer');
  function setOpen(open) {
    body.classList.toggle('sn-open', open);
    drawerEl.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  document.querySelector('.sn-menu-btn').addEventListener('click', function () { setOpen(true); });
  document.querySelector('.sn-close').addEventListener('click', function () { setOpen(false); });
  document.querySelector('.sn-backdrop').addEventListener('click', function () { setOpen(false); });
  drawerEl.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });

  var aboutBtn = document.querySelector('.sn-about-btn');
  var sub = document.querySelector('.sn-sub');
  aboutBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = !sub.classList.contains('open');
    sub.classList.toggle('open', open);
    aboutBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  document.addEventListener('click', function () { sub.classList.remove('open'); aboutBtn.setAttribute('aria-expanded', 'false'); });
})();
