/**
 * يبني نسختي البروفايل من profile.data.js
 *   node render.js
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url'); // print-to-pdf loads the HTML by file URL
const { spawnSync } = require('child_process');
const { contact, images, ar, en } = require('./profile.data');

const root = path.resolve(__dirname, '../..');
const outDir = __dirname;
const src = (rel) => path.relative(outDir, path.join(root, rel)).split(path.sep).join('/');

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function page(n, total, copy, inner) {
  return `<section class="sheet">
    <div class="sheet-body">${inner}</div>
    <footer class="run">
      <span>${esc(copy.lang === 'ar' ? contact.brandAr : contact.brandEn)}</span>
      <span class="ltr">${esc(contact.site)}</span>
      <span>${esc(copy.pageWord)} ${n} / ${total}</span>
    </footer>
  </section>`;
}

function html(copy) {
  const vision = src(images.vision);
  const logo = `<span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#C6A15B" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z"/><path d="M6 20h12"/></svg></span>`;
  const total = 7;
  const shots = copy.shots.map((s) => `
    <figure class="shot">
      <img src="${src(images[s.img])}" alt="">
      <figcaption><b>${esc(s.h)}</b><span>${esc(s.p)}</span></figcaption>
    </figure>`).join('');

  const pillars = copy.pillars.map((p) => `
    <article class="pillar"><h3>${esc(p.h)}</h3><p>${esc(p.p)}</p></article>`).join('');

  const points = copy.points.map((p) => `<li>${esc(p)}</li>`).join('');

  const group = (g) => `
    <section class="group">
      <h3>${esc(g.h)}</h3>
      <ul>${g.items.map(([h, p]) => `<li><b>${esc(h)}</b><span>${esc(p)}</span></li>`).join('')}</ul>
    </section>`;

  const why = copy.why.map(([h, p]) => `
    <article class="why"><b>${esc(h)}</b><span>${esc(p)}</span></article>`).join('');

  const clients = images.clients.map((c) => `
    <figure class="client">
      <img src="${src(c.src)}" alt="">
      <figcaption>${esc(copy.lang === 'ar' ? c.ar : c.en)}</figcaption>
    </figure>`).join('');

  const plans = copy.plans.map((p) => `
    <article class="plan${p.featured ? ' featured' : ''}">
      <h3>${esc(p.name)}</h3>
      <p class="tag">${esc(p.tag)}</p>
      <p class="price"><b>${esc(p.price)}</b><span>${esc(p.unit)}</span></p>
      <ul>${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
    </article>`).join('');

  const steps = copy.steps.map(([h, p], i) => `
    <article class="step"><span>${i + 1}</span><div><b>${esc(h)}</b><p>${esc(p)}</p></div></article>`).join('');

  const L = copy.labels;
  const legalName = copy.lang === 'ar' ? contact.legalAr : `${contact.legalEn} · ${contact.legalAr}`;
  const manager = copy.lang === 'ar' ? contact.managerAr : contact.managerEn;
  const bank = copy.lang === 'ar' ? contact.bankAr : contact.bankEn;

  const cover = `<section class="cover">
    <div class="cover-top">
      ${logo}
      <div>
        <div class="brand">${esc(copy.lang === 'ar' ? contact.brandAr : contact.brandEn)}</div>
        <div class="subbrand">${esc(copy.lang === 'ar' ? 'للمحاسبة المالية' : 'Financial accounting')}</div>
      </div>
    </div>
    <p class="kicker">${esc(copy.kicker)}</p>
    <h1>${esc(copy.coverTitle)}</h1>
    <p class="lead">${esc(copy.coverLead)}</p>
    <div class="chips">${copy.chips.map((c) => `<span>${esc(c)}</span>`).join('')}</div>
    <div class="stats">${copy.stats.map((s) => `<div><b>${esc(s.n)}</b><span>${esc(s.l)}</span></div>`).join('')}</div>
    <div class="cover-bottom">
      <p>${esc(copy.coverFoot)}</p>
      <p class="ltr">${esc(contact.site)} · ${esc(contact.email)} · ${esc(contact.phone)}</p>
      <p class="legal">${esc(legalName)}</p>
    </div>
  </section>`;

  const p2 = page(2, total, copy, `
    <p class="eyebrow">${esc(copy.aboutEyebrow)}</p>
    <h2>${esc(copy.aboutTitle)}</h2>
    <p class="prose">${esc(copy.aboutBody)}</p>
    <div class="pillars">${pillars}</div>
    <ul class="points">${points}</ul>
    <div class="whys">${why}</div>`);

  const p3 = page(3, total, copy, `
    <p class="eyebrow">${esc(copy.shotsEyebrow)}</p>
    <h2>${esc(copy.shotsTitle)}</h2>
    <p class="note">${esc(copy.shotsNote)}</p>
    <div class="shots">
      <div class="shot wide">${shots.split('</figure>')[0]}</figure></div>
      <div class="shot-row">
        ${shots.split('</figure>').slice(1, 3).map((s) => s + '</figure>').join('')}
      </div>
    </div>`);

  const p4 = page(4, total, copy, `
    <p class="eyebrow">${esc(copy.modEyebrow)}</p>
    <h2>${esc(copy.modTitle)}</h2>
    <p class="note">${esc(copy.modLead)}</p>
    ${group(copy.groups[0])}
    ${group(copy.groups[1])}
    <p class="aside">${esc(copy.modAside)}</p>`);

  const p5 = page(5, total, copy, `
    <p class="eyebrow">${esc(copy.modEyebrow)}</p>
    <h2>${esc(copy.modTitle)}</h2>
    ${group(copy.groups[2])}
    ${group(copy.groups[3])}
    ${group(copy.groups[4])}`);

  const p6 = page(6, total, copy, `
    <p class="eyebrow">${esc(copy.clientsEyebrow)}</p>
    <h2>${esc(copy.clientsTitle)}</h2>
    <p class="note">${esc(copy.clientsLead)}</p>
    <div class="clients">${clients}</div>
    <p class="eyebrow" style="margin-top:14px">${esc(copy.plansEyebrow)}</p>
    <h2>${esc(copy.plansTitle)}</h2>
    <p class="note">${esc(copy.plansLead)}</p>
    <div class="plans">${plans}</div>`);

  const p7 = page(7, total, copy, `
    <p class="eyebrow">${esc(copy.stepsEyebrow)}</p>
    <h2>${esc(copy.stepsTitle)}</h2>
    <div class="steps">${steps}</div>
    <h3 class="block-title">${esc(copy.payTitle)}</h3>
    <div class="facts">
      <div><small>${esc(L.bank)}</small><b>${esc(bank)}</b></div>
      <div><small>${esc(L.beneficiary)}</small><b>${esc(contact.beneficiary)}</b></div>
      <div><small>${esc(L.account)}</small><b class="ltr">${esc(contact.account)}</b></div>
      <div><small>${esc(L.iban)}</small><b class="ltr">${esc(contact.iban)}</b></div>
    </div>
    <h3 class="block-title">${esc(copy.contactTitle)}</h3>
    <p class="note">${esc(copy.contactLead)}</p>
    <div class="facts">
      <div><small>${esc(L.phone)}</small><b class="ltr">${esc(contact.phoneIntl)}</b></div>
      <div><small>${esc(L.whatsapp)}</small><b class="ltr">${esc(contact.phone)}</b></div>
      <div><small>${esc(L.email)}</small><b class="ltr">${esc(contact.email)}</b></div>
      <div><small>${esc(L.site)}</small><b class="ltr">${esc(contact.site)}</b></div>
      <div><small>${esc(L.legal)}</small><b>${esc(copy.lang === 'ar' ? contact.legalAr : contact.legalEn)}</b></div>
      <div><small>${esc(L.unified)}</small><b class="ltr">${esc(contact.unified)}</b></div>
      <div><small>${esc(L.manager)}</small><b>${esc(manager)}</b></div>
    </div>
    <div class="vision">
      <img src="${vision}" alt="">
      <p>${esc(copy.visionLine)}</p>
    </div>
    <p class="fine">${esc(copy.fine)}</p>`);

  return `<!DOCTYPE html>
<html lang="${copy.lang}" dir="${copy.dir}">
<head>
<meta charset="utf-8">
<title>${esc(copy.lang === 'ar' ? contact.brandAr : contact.brandEn)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Tahoma, sans-serif;
    color: #1E1B33;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .ltr { direction: ltr; unicode-bidi: isolate; }
  .cover {
    width: 210mm; height: 297mm; page-break-after: always;
    background: #14122E; color: #F6F1E6;
    padding: 22mm 18mm 16mm;
    display: flex; flex-direction: column;
  }
  .cover-top { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 78px; height: 78px; border-radius: 18px; flex: none;
    background: #151340; border: 2px solid #C6A15B;
    display: flex; align-items: center; justify-content: center;
  }
  .logo svg { width: 46px; height: 46px; }
  .brand { font-size: 28px; font-weight: 700; letter-spacing: 0; }
  .subbrand { color: #E7D6AD; font-size: 16px; margin-top: 2px; }
  .kicker { margin: 28mm 0 8px; color: #C6A15B; letter-spacing: .08em; font-size: 13px; }
  h1 { margin: 0; font-size: 40px; line-height: 1.25; font-weight: 700; max-width: 16ch; }
  .lead { font-size: 16px; line-height: 1.7; color: #E7E2D6; max-width: 38em; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chips span { border: 1px solid #C6A15B; color: #E7D6AD; border-radius: 999px; padding: 6px 12px; font-size: 13px; }
  .stats { margin-top: auto; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px 0 18px; }
  .stats div { border-top: 1px solid rgba(198,161,91,.55); padding-top: 8px; }
  .stats b { display: block; color: #C6A15B; font-size: 22px; }
  .stats span { display: block; color: #E7E2D6; font-size: 12px; line-height: 1.35; margin-top: 2px; }
  .cover-bottom { border-top: 1px solid rgba(198,161,91,.45); padding-top: 14px; }
  .cover-bottom p { margin: 4px 0; font-size: 13.5px; color: #E7E2D6; }
  .legal { color: #C6A15B !important; }
  .sheet {
    width: 210mm; height: 297mm; page-break-after: always;
    background: #F7F4EE; position: relative;
  }
  .sheet-body { padding: 14mm 14mm 16mm; }
  h2 { margin: 0 0 8px; font-size: 26px; line-height: 1.25; color: #14122E; }
  h3 { margin: 0; font-size: 15px; color: #14122E; }
  .eyebrow { margin: 0 0 4px; color: #8A6A32; font-size: 12px; font-weight: 700; }
  .prose, .note { margin: 0 0 12px; font-size: 13px; line-height: 1.65; color: #3C3954; }
  .pillars { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
  .pillar { background: #fff; border-top: 3px solid #C6A15B; border-radius: 10px; padding: 10px 12px; }
  .pillar p, .points { font-size: 12.5px; line-height: 1.6; color: #3C3954; margin: 6px 0 0; }
  .points { margin-top: 12px; padding-inline-start: 18px; }
  .points li { margin: 4px 0; }
  .shots { display: flex; flex-direction: column; gap: 8px; }
  .shot { margin: 0; background: #fff; border-radius: 10px; overflow: hidden; border: 1px solid #E4DCC8; }
  .shot img { width: 100%; height: 68mm; object-fit: contain; object-position: center; display: block; background: #EFEAE0; }
  .shot-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .shot-row .shot img { height: 52mm; }
  .aside { margin: 8px 0 0; background: #14122E; color: #F6F1E6; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; line-height: 1.55; }
  figcaption { padding: 7px 10px 9px; }
  figcaption b { display: block; font-size: 13px; }
  figcaption span { display: block; font-size: 11.5px; line-height: 1.45; color: #5C5870; margin-top: 2px; }
  .group { margin: 0 0 8px; }
  .group h3 { background: #14122E; color: #F6F1E6; display: inline-block; padding: 3px 10px; border-radius: 7px; font-size: 13px; }
  .group ul { list-style: none; margin: 6px 0 0; padding: 0; display: grid; gap: 4px; }
  .group li { background: #fff; border-radius: 8px; padding: 6px 10px; display: grid; grid-template-columns: 46mm 1fr; gap: 8px; align-items: start; }
  .group li b { font-size: 12px; }
  .group li span { font-size: 11.5px; line-height: 1.45; color: #3C3954; }
  .whys { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .why { background: #fff; border-radius: 10px; padding: 8px 10px; border-inline-start: 3px solid #C6A15B; }
  .why b { display: block; font-size: 13px; }
  .why span { display: block; font-size: 11.5px; line-height: 1.45; color: #3C3954; margin-top: 2px; }
  .clients { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .client { margin: 0; background: #fff; border-radius: 10px; padding: 8px; text-align: center; border: 1px solid #E4DCC8; }
  .client img { height: 22mm; width: 100%; object-fit: contain; }
  .client figcaption { font-size: 11px; line-height: 1.35; color: #1E1B33; padding: 6px 2px 2px; }
  .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .plan { background: #fff; border-radius: 12px; padding: 10px 12px; border: 1px solid #E4DCC8; }
  .plan.featured { background: #14122E; color: #F6F1E6; border-color: #14122E; }
  .plan .tag { margin: 4px 0 8px; font-size: 12px; color: #6C6A82; }
  .plan.featured .tag { color: #E7D6AD; }
  .price { margin: 0 0 8px; }
  .price b { font-size: 28px; color: #14122E; }
  .plan.featured .price b { color: #C6A15B; }
  .price span { display: block; font-size: 12px; color: #6C6A82; }
  .plan.featured .price span { color: #E7D6AD; }
  .plan ul { margin: 0; padding-inline-start: 16px; }
  .plan li { font-size: 11.5px; line-height: 1.4; margin: 3px 0; }
  .steps { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .step { display: flex; gap: 8px; background: #fff; border-radius: 10px; padding: 8px 10px; }
  .step > span { width: 22px; height: 22px; border-radius: 50%; background: #C6A15B; color: #14122E; font-weight: 700; display: flex; align-items: center; justify-content: center; flex: none; font-size: 12px; }
  .step b { font-size: 13px; }
  .step p { margin: 2px 0 0; font-size: 11.5px; line-height: 1.4; color: #3C3954; }
  .block-title { margin: 12px 0 6px; font-size: 15px; }
  .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .facts div { background: #fff; border-radius: 8px; padding: 6px 10px; }
  .facts small { display: block; color: #8A6A32; font-size: 10.5px; }
  .facts b { font-size: 12.5px; font-weight: 650; }
  .vision { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  .vision img { height: 16mm; width: auto; }
  .vision p { margin: 0; font-size: 12.5px; color: #3C3954; }
  .fine { margin: 8px 0 0; font-size: 10px; color: #6C6A82; }
  .run {
    position: absolute; left: 14mm; right: 14mm; bottom: 7mm;
    display: flex; justify-content: space-between; gap: 8px;
    font-size: 10px; color: #6C6A82; border-top: 1px solid #E4DCC8; padding-top: 4px;
  }
</style>
</head>
<body>
${cover}
${p2}
${p3}
${p4}
${p5}
${p6}
${p7}
</body>
</html>`;
}

function browser() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env['ProgramFiles'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find((p) => p && fs.existsSync(p));
}

function printPdf(htmlPath, pdfPath) {
  const bin = browser();
  if (!bin) throw new Error('EDGE_OR_CHROME_NOT_FOUND');
  const r = spawnSync(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('PRINT_FAILED_' + r.status);
}

for (const copy of [ar, en]) {
  const htmlPath = path.join(outDir, copy.file.replace(/\.pdf$/, '.html'));
  const pdfPath = path.join(outDir, copy.file);
  fs.writeFileSync(htmlPath, html(copy), 'utf8');
  printPdf(htmlPath, pdfPath);
  const st = fs.statSync(pdfPath);
  console.log('PDF', copy.file, st.size);
}
