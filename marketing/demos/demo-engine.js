/* جداره Finance — محرك العروض التوضيحية (15 ثانية لكل عرض).
   يُستخدم في صفحة الهبوط مباشرة، ويُسجَّل منه ملفات MP4 عبر record.py.
   الأرقام كلها بيانات تجريبية. */
(function (global) {
  const ICO = {
    dash: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z"/>',
    pos: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h2M7 14h10"/>',
    sales: '<path d="M4 19V9M10 19V5M16 19v-7M20 19H3"/>',
    purch: '<circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/><path d="M3 4h2l2.2 10h11.3l1.8-7H7"/>',
    accounts: '<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4z"/><path d="M5 18a2 2 0 0 1 2-2h11"/>',
    journal: '<path d="M8 3v3M16 3v3M4 8h16"/><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M8 12h8M8 16h5"/>',
    products: '<path d="M3 8l9-4 9 4-9 4-9-4z"/><path d="M3 8v8l9 4 9-4V8M12 12v8"/>',
    count: '<path d="M8 4h8v4H8zM6 8h12v12H6z"/><path d="M9 13h6M9 16h4"/>',
    finance: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/>',
    reports: '<path d="M4 19h16M7 16V9M12 16V5M17 16v-4"/>',
    vat: '<path d="M19 5 5 19M7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/>',
    zakat: '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5c.6-1 3.4-1.2 4.2.2.7 1.2-.2 2-2.1 2.3-1.8.3-2.8 1-2.2 2.2.7 1.3 3.6 1.2 4.4.1"/>',
  };
  const ico = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICO[k] || ''}</svg>`;
  const SIDE = [['dash', 'لوحة التحكم'], ['pos', 'نقطة البيع'], ['sales', 'المبيعات'], ['purch', 'المشتريات'], ['accounts', 'دليل الحسابات'], ['journal', 'القيود اليومية'], ['products', 'المنتجات'], ['count', 'جرد المخزون'], ['finance', 'المالية'], ['reports', 'التقارير'], ['vat', 'الإقرار الربعي'], ['zakat', 'الزكاة']];
  const CROWN = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C6A15B" stroke-width="1.6"><path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z"/><path d="M6 20h12"/></svg>';
  const ARROW = '<svg class="dp-cur" viewBox="0 0 24 24"><path d="M4 2l15 9-6.5 1.6L9.5 19z" fill="#1E1B4B" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const fmt = (n, d = 2) => n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

  function qr() {
    let s = '', seed = 11;
    for (let i = 0; i < 81; i++) { seed = (seed * 9301 + 49297) % 233280; s += `<i style="background:${seed / 233280 > 0.47 ? '#1E1B33' : 'transparent'}"></i>`; }
    return `<div class="qr">${s}</div>`;
  }
  const inp = (id, ph = '') => `<div class="inp" id="${id}"><span class="txt">${ph}</span></div>`;

  /* ---------------- السيناريوهات ---------------- */
  const SCRIPTS = {
    dash: {
      title: 'لوحة التحكم والرسوم', desc: 'بطاقات المبالغ ثم حلقة التوزيع وأعمدة المبيعات والتكلفة والربح.', dur: 15000,
      steps: [
        [0, (c) => {
          c.nav('dash'); c.cap('١. المبالغ في المقدّمة قبل الرسوم');
          const tile = (id, label, color) => `<div class="dkpi" style="background:${color}"><small>${label}</small><b id="${id}">0.00</b></div>`;
          c.screen(`<h2 class="pg">لوحة التحكم</h2><p class="sub">من بداية السنة حتى اليوم</p>
          <div class="dkpis">
            ${tile('k1', 'صافي المبيعات', '#1D4E89')}${tile('k2', 'المشتريات', '#C4A35A')}${tile('k3', 'المصروفات التشغيلية', '#C0392B')}${tile('k4', 'صافي الربح', '#1F7A4D')}
            ${tile('k5', 'النقدية الختامية', '#1E6B4F')}${tile('k6', 'العملاء (المدينون)', '#2E6B8A')}${tile('k7', 'الموردون (الدائنون)', '#8A6A2F')}${tile('k8', 'صافي الضريبة', '#3D4C73')}
          </div>
          <div class="dcharts fade" id="charts">
            <div class="dpanel" id="donut"><b>توزيع المبيعات والمشتريات والمصروفات</b>
              <div class="donutrow">
                <svg viewBox="0 0 120 120" width="118" height="118"><g transform="translate(60 60) rotate(-90)">
                  <circle class="sl" r="42" fill="none" stroke="#1D4E89" stroke-width="16" stroke-dasharray="0 264"/>
                  <circle class="pu" r="42" fill="none" stroke="#C4A35A" stroke-width="16" stroke-dasharray="0 264" stroke-dashoffset="-164"/>
                  <circle class="ex" r="42" fill="none" stroke="#C0392B" stroke-width="16" stroke-dasharray="0 264" stroke-dashoffset="-230"/>
                </g></svg>
                <div class="dleg"><span><i style="background:#1D4E89"></i>المبيعات <b dir="ltr">64%</b></span><span><i style="background:#C4A35A"></i>المشتريات <b dir="ltr">25%</b></span><span><i style="background:#C0392B"></i>المصروفات <b dir="ltr">11%</b></span></div>
              </div>
            </div>
            <div class="dpanel"><b>المبيعات والتكلفة والأرباح</b>
              <div class="bars2" id="bars">
                <i><em>186,450</em><u class="s"></u><span>المبيعات</span></i>
                <i><em>74,200</em><u class="g"></u><span>المشتريات</span></i>
                <i><em>31,800</em><u class="r"></u><span>المصروفات</span></i>
                <i><em>80,450</em><u class="p"></u><span>صافي الربح</span></i>
              </div>
            </div>
          </div>`);
        }],
        [700, (c) => { c.count('#k1', 186450, 1100); c.count('#k2', 74200, 1100); c.count('#k3', 31800, 1100); c.count('#k4', 80450, 1100); }],
        [900, (c) => { c.count('#k5', 42910, 1100); c.count('#k6', 28640, 1100); c.count('#k7', 15220, 1100); c.count('#k8', 12180, 1100); }],
        [2600, (c) => { c.cap('٢. حلقة التوزيع وأعمدة المبيعات والتكلفة والربح'); c.on('#charts'); c.on('#bars'); }],
        [4200, (c) => c.move('#donut')],
        [6400, (c) => { c.cap('٣. المبيعات هي الشريحة الأكبر، والربح بجانب التكلفة'); c.move('#bars'); }],
        [9800, (c) => c.cap('الرسوم من قيود المنشأة · بيانات تجريبية')],
      ],
    },
    invoice: {
      title: 'إصدار فاتورة ضريبية', desc: 'فاتورة بضريبة ١٥٪ تلقائية ورمز QR وقيد محاسبي مرحّل.', dur: 15000,
      steps: [
        [0, (c) => {
          c.nav('sales'); c.cap('١. افتح المبيعات وأنشئ فاتورة جديدة');
          c.screen(`<h2 class="pg">فاتورة مبيعات جديدة</h2><p class="sub">الضريبة ١٥٪ تُحسب تلقائياً</p>
          <div class="card"><div class="row2"><div><label>العميل</label>${inp('cust')}</div><div><label>المستودع</label><div class="inp">المستودع الرئيسي</div></div></div></div>
          <div class="card" style="padding:8px 12px"><table class="t"><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
          <tr id="line" class="fade"><td>خدمات استشارية</td><td>2</td><td>1,500.00</td><td>3,000.00</td></tr></table>
          <div class="btn ghost" id="add" style="margin:6px 0 2px;padding:4px 12px;font-size:12.5px">+ إضافة صنف</div></div>
          <div class="totals"><div>الأساس<b id="t1">0.00</b></div><div>ضريبة القيمة المضافة ١٥٪<b id="t2">0.00</b></div><div class="grand">الإجمالي<b id="t3">0.00</b></div></div>
          <div class="btn gold" id="ok">اعتماد الفاتورة</div>
          <div class="ov" id="done"><span class="pill ok big" style="font-size:20px;padding:5px 20px">✓ تم إصدار الفاتورة</span><div style="color:#6C6A82">INV-2026-0001 — شركة الأفق التجارية</div>${qr()}
          <div class="card fade" id="jr" style="width:430px;margin:4px 0 0"><div style="font-weight:700;margin-bottom:4px">القيد المحاسبي (تلقائي)</div>
          <div class="zr"><span>العملاء (مدين)</span><b>3,450.00</b></div><div class="zr"><span>إيرادات المبيعات (دائن)</span><b>3,000.00</b></div><div class="zr" style="border:none"><span>ضريبة القيمة المضافة (دائن)</span><b>450.00</b></div></div></div>`);
        }],
        [900, (c) => c.move('#cust')], [1700, (c) => c.click('#cust')],
        [1900, (c) => { c.cap('٢. اكتب اسم العميل'); c.type('#cust', 'شركة الأفق التجارية', 1700); }],
        [4200, (c) => { c.cap('٣. أضف الصنف — الضريبة تُحسب تلقائياً'); c.move('#add'); }],
        [5100, (c) => { c.click('#add'); c.on('#line'); }],
        [5400, (c) => { c.count('#t1', 3000, 900); c.count('#t2', 450, 900); c.count('#t3', 3450, 900); }],
        [7600, (c) => { c.cap('٤. اعتمد الفاتورة'); c.move('#ok'); }],
        [8600, (c) => c.click('#ok')],
        [9000, (c) => { c.on('#done'); c.cap('٥. تُصدر برمز QR ويترحّل القيد المحاسبي تلقائياً'); }],
        [11000, (c) => c.on('#jr')],
      ],
    },

    journal: {
      title: 'القيود اليومية', desc: 'قيد مزدوج لا يُحفظ إلا إذا كان متوازناً.', dur: 15000,
      steps: [
        [0, (c) => {
          c.nav('journal'); c.cap('١. افتح القيود اليومية');
          c.screen(`<h2 class="pg">قيد يومية جديد</h2><p class="sub">يجب أن يتساوى إجمالي المدين مع إجمالي الدائن</p>
          <div class="card"><label>بيان القيد</label>${inp('desc')}</div>
          <div class="card"><div class="row3" style="grid-template-columns:2fr 1fr 1fr">
          <div><label>الحساب</label>${inp('a1')}</div><div><label>مدين</label>${inp('d1')}</div><div><label>دائن</label><div class="inp"></div></div>
          <div>${inp('a2')}</div><div><div class="inp"></div></div><div>${inp('c2')}</div></div>
          <div style="margin-top:10px">مدين: <b id="sd">0.00</b> — دائن: <b id="sc">0.00</b> — <span class="pill bad" id="bal">غير متوازن</span></div></div>
          <div class="btn gold" id="save">حفظ القيد</div>
          <div class="card fade" id="entry" style="margin-top:12px"><span class="pill ok">تم الحفظ ✓</span> &nbsp; دفع إيجار شهر أكتوبر — <b>5,000.00</b> &nbsp; <span class="pill ok" id="tb" style="float:left">ميزان المراجعة: متوازن ✓</span></div>`);
        }],
        [900, (c) => c.move('#desc')], [1700, (c) => c.click('#desc')],
        [1900, (c) => { c.cap('٢. اكتب بيان القيد'); c.type('#desc', 'دفع إيجار شهر أكتوبر', 1500); }],
        [3900, (c) => { c.cap('٣. أضف الطرف المدين'); c.move('#a1'); }],
        [4800, (c) => { c.click('#a1'); c.type('#a1', '5104 - مصروفات عمومية وإدارية', 900); }],
        [6000, (c) => { c.move('#d1'); }],
        [6800, (c) => { c.click('#d1'); c.type('#d1', '5,000', 500); }],
        [7500, (c) => { c.set('#sd', '5,000.00'); }],
        [8000, (c) => { c.cap('٤. أضف الطرف الدائن — النظام يمنع القيد غير المتوازن'); c.move('#a2'); }],
        [8900, (c) => { c.click('#a2'); c.type('#a2', '1102 - البنوك', 600); }],
        [9700, (c) => c.move('#c2')],
        [10400, (c) => { c.click('#c2'); c.type('#c2', '5,000', 500); }],
        [11000, (c) => { c.set('#sc', '5,000.00'); const b = c.$('#bal'); b.className = 'pill ok'; b.textContent = 'متوازن ✓'; }],
        [11700, (c) => { c.cap('٥. احفظ — ويظهر فوراً في الأستاذ العام'); c.move('#save'); }],
        [12700, (c) => { c.click('#save'); c.on('#entry'); }],
      ],
    },

    pos: {
      title: 'نقطة البيع (POS)', desc: 'بيع سريع: فاتورة وقيد وسند قبض وخصم مخزون بضغطة واحدة.', dur: 15000,
      steps: [
        [0, (c) => {
          c.nav('pos'); c.cap('١. اختر المنتجات بلمسة واحدة');
          const P = [['قهوة', '12.00'], ['عصير طازج', '15.00'], ['ساندويتش', '18.00'], ['كيك', '22.00'], ['مياه', '3.00'], ['تمر', '25.00']];
          c.screen(`<h2 class="pg">نقطة البيع</h2><p class="sub">الفرع الرئيسي — الصندوق النقدي</p>
          <div class="pos"><div class="tiles">${P.map((p, i) => `<div class="tile" id="p${i}"><b>${p[0]}</b><small>${p[1]} ر.س</small></div>`).join('')}</div>
          <div class="cart"><b>سلة البيع</b><div id="lines" style="min-height:96px;margin:6px 0"></div>
          <div class="cl" style="border:none"><span>الأساس</span><b id="pb">0.00</b></div><div class="cl" style="border:none"><span>الضريبة ١٥٪</span><b id="pv">0.00</b></div>
          <div class="cl" style="border:none;font-size:16px"><span>الإجمالي</span><b id="pt">0.00</b></div>
          <div class="inp" id="tre" style="margin:6px 0">الصندوق الرئيسي</div><div class="btn gold" id="pay" style="width:100%;text-align:center">إتمام البيع</div></div></div>
          <div class="ov" id="done"><span class="pill ok" style="font-size:20px;padding:5px 20px">✓ تم البيع بنجاح</span><div><span class="chip fade">فاتورة ضريبية</span><span class="chip fade">قيد محاسبي</span><span class="chip fade">سند قبض</span><span class="chip fade">خصم من المخزون</span></div></div>`);
          c.cart = { 0: 0, 2: 0, 4: 0 };
        }],
        [900, (c) => c.move('#p0')], [1600, (c) => { c.click('#p0'); c.addLine('قهوة', 12, 1, 0); }],
        [2500, (c) => c.move('#p2')], [3200, (c) => { c.click('#p2'); c.addLine('ساندويتش', 18, 1, 2); }],
        [3900, (c) => { c.click('#p2'); c.addLine('ساندويتش', 18, 2, 2); }],
        [4700, (c) => c.move('#p4')], [5400, (c) => { c.click('#p4'); c.addLine('مياه', 3, 1, 4); }],
        [6600, (c) => { c.cap('٢. الضريبة والإجمالي يُحسبان فوراً'); }],
        [8000, (c) => { c.cap('٣. اختر الصندوق ثم أتمّ البيع'); c.move('#pay'); }],
        [9300, (c) => c.click('#pay')],
        [9700, (c) => { c.on('#done'); c.cap('بضغطة واحدة: فاتورة + قيد + تحصيل + خصم من المخزون'); c.stagger('#done .chip', 550); }],
      ],
    },

    stock: {
      title: 'المخزون والجرد', desc: 'تنبيهات النواقص وجرد المستودع مع تسوية الفروقات تلقائياً.', dur: 15000,
      steps: [
        [0, (c) => {
          c.nav('products'); c.cap('١. تابع أرصدة المخزون وتنبيهات النواقص');
          c.screen(`<h2 class="pg">المنتجات</h2><p class="sub">الأصناف التي وصلت لحد إعادة الطلب تظهر بتنبيه</p>
          <div class="card" style="padding:8px 12px"><table class="t"><tr><th>الصنف</th><th>التصنيف</th><th>الرصيد</th><th>حد إعادة الطلب</th><th>الحالة</th></tr>
          <tr><td>ورق A4</td><td>قرطاسية</td><td>120</td><td>30</td><td><span class="pill ok">طبيعي</span></td></tr>
          <tr class="low hl"><td>حبر طابعة</td><td>مستلزمات</td><td>4</td><td>10</td><td><span class="pill warn">⚠ منخفض</span></td></tr>
          <tr><td>أقلام</td><td>قرطاسية</td><td>75</td><td>20</td><td><span class="pill ok">طبيعي</span></td></tr></table></div>`);
        }],
        [4300, (c) => {
          c.nav('count'); c.cap('٢. افتح جرداً للمستودع وسجّل الكميات الفعلية');
          c.screen(`<h2 class="pg">جرد المخزون</h2><p class="sub">المستودع الرئيسي — جرد رقم 0001</p>
          <div class="card" style="padding:8px 12px"><table class="t"><tr><th>الصنف</th><th>الكمية بالنظام</th><th>الكمية الفعلية</th><th>الفرق</th></tr>
          <tr><td>ورق A4</td><td>120</td><td style="width:150px">${inp('c1')}</td><td id="v1"></td></tr>
          <tr><td>حبر طابعة</td><td>4</td><td>${inp('c2')}</td><td id="v2"></td></tr></table></div>
          <div class="btn gold" id="approve">اعتماد الجرد وتسوية الفروقات</div> <span class="pill ok fade" id="okp" style="margin-right:10px">تمت التسوية تلقائياً ✓</span>`);
        }],
        [5300, (c) => c.move('#c1')], [6100, (c) => { c.click('#c1'); c.type('#c1', '117', 500); }],
        [6900, (c) => c.set('#v1', '<span class="neg" dir="ltr">-3</span>')],
        [7400, (c) => c.move('#c2')], [8200, (c) => { c.click('#c2'); c.type('#c2', '9', 300); }],
        [8800, (c) => c.set('#v2', '<span class="posv" dir="ltr">+5</span>')],
        [9800, (c) => { c.cap('٣. اعتمد الجرد'); c.move('#approve'); }],
        [10900, (c) => c.click('#approve')],
        [11300, (c) => { c.on('#okp'); c.cap('٤. الفروقات تُسوّى تلقائياً بحركات مخزون مسجّلة'); }],
      ],
    },

    tax: {
      title: 'الإقرار الضريبي والزكاة', desc: 'إقرار ربعي جاهز للطباعة، ووعاء زكوي محسوب من ميزانيتك.', dur: 15000,
      steps: [
        [0, (c) => {
          c.nav('vat'); c.cap('١. اختر الربع الضريبي');
          c.screen(`<h2 class="pg">الإقرار الضريبي الربعي</h2><p class="sub">مستند قابل للطباعة يُرفق مع هيئة الزكاة والضريبة والجمارك</p>
          <div class="card"><div style="display:flex;gap:12px;align-items:center"><div class="inp" id="q" style="width:230px">الربع الأول</div><div class="btn ghost" id="print" style="margin-right:auto">طباعة / تصدير PDF</div></div></div>
          <div class="card" style="padding:8px 12px"><table class="t"><tr><th>البند</th><th>الأساس الخاضع</th><th>ضريبة ١٥٪</th></tr>
          <tr class="fade r"><td>المبيعات (ضريبة المخرجات)</td><td>184,500.00</td><td>27,675.00</td></tr>
          <tr class="fade r"><td>المشتريات والمصروفات (ضريبة المدخلات)</td><td>61,400.00</td><td>9,210.00</td></tr></table></div>
          <div class="totals"><div class="grand" style="flex:none;width:330px">صافي الضريبة المستحقة للهيئة<b id="net">0.00 ر.س</b></div><div class="fade" id="pd" style="flex:none;padding-top:16px"><span class="pill ok">✓ تم تجهيز ملف PDF</span></div></div>`);
        }],
        [900, (c) => c.move('#q')], [1600, (c) => { c.click('#q'); c.set('#q', 'الربع الثالث (يوليو - سبتمبر)'); }],
        [2600, (c) => { c.stagger('.r', 700); c.cap('٢. مبيعاتك ومشترياتك ← الضريبة المستحقة'); }],
        [4200, (c) => c.count('#net', 18465, 1100, 2, ' ر.س')],
        [6300, (c) => { c.cap('٣. مستند جاهز للطباعة والإرفاق'); c.move('#print'); }],
        [7300, (c) => { c.click('#print'); c.on('#pd'); }],
        [8800, (c) => {
          c.nav('zakat'); c.cap('٤. الوعاء الزكوي والزكاة المستحقة من ميزانيتك');
          c.screen(`<h2 class="pg">الزكاة — الوعاء الزكوي</h2><p class="sub">بطريقة مصادر الأموال — بيانات تجريبية</p>
          <div class="card" style="padding:8px 14px"><div class="zr fade z"><span>رأس المال + الاحتياطيات + الأرباح المرحّلة</span><b>670,000.00</b></div>
          <div class="zr fade z"><span>القروض طويلة الأجل + صافي الربح</span><b>170,000.00</b></div>
          <div class="zr fade z"><span>يُخصم: صافي الأصول الثابتة</span><b class="neg">(210,000.00)</b></div>
          <div class="zr tot fade z"><span>الوعاء الزكوي</span><b>630,000.00</b></div></div>
          <div class="kpi fade z" style="width:340px"><small>الزكاة المستحقة (سنة هجرية ٢.٥٪)</small><b id="zk">0.00 ر.س</b></div>`);
          c.stagger('.z', 650);
        }],
        [11800, (c) => c.count('#zk', 15750, 1200, 2, ' ر.س')],
      ],
    },
  };

  /* ---------------- المحرك ---------------- */
  function mount(host, key, opts = {}) {
    const S = SCRIPTS[key];
    host.classList.add('dpwrap');
    host.innerHTML = `<div class="dp"><div class="dp-prog"></div><div class="dp-wm">بيانات تجريبية</div><aside class="dp-side"><div class="dp-brand"><span class="dp-crown">${CROWN}</span><div><b>جداره Finance</b><small>للمحاسبة المالية</small></div></div>${SIDE.map(([k, l]) => `<div class="dp-nav" data-k="${k}">${ico(k)}${l}</div>`).join('')}</aside><main class="dp-main"></main><div class="dp-cap"></div>${ARROW}</div>`;
    const dp = host.querySelector('.dp'), main = dp.querySelector('.dp-main'), cap = dp.querySelector('.dp-cap'), cur = dp.querySelector('.dp-cur'), prog = dp.querySelector('.dp-prog');
    let scale = 1, timers = [], ivs = [];
    const fit = () => { scale = host.clientWidth / 960; dp.style.transform = `scale(${scale})`; };
    fit(); if (global.ResizeObserver) new ResizeObserver(fit).observe(host);
    const $ = (s) => dp.querySelector(s);
    const at = (el) => { const r = el.getBoundingClientRect(), f = dp.getBoundingClientRect(); return { x: (r.left - f.left + r.width / 2) / scale, y: (r.top - f.top + r.height / 2) / scale }; };
    const ripple = () => { const r = document.createElement('span'); r.className = 'rip'; r.style.left = cur.style.left; r.style.top = cur.style.top; dp.appendChild(r); setTimeout(() => r.remove(), 650); };
    const raf = global.requestAnimationFrame || ((f) => setTimeout(() => f(Date.now()), 16));

    const ctx = {
      $, cart: {},
      screen: (h) => { main.innerHTML = h; },
      nav: (k) => dp.querySelectorAll('.dp-nav').forEach((n) => n.classList.toggle('on', n.dataset.k === k)),
      cap: (t) => { cap.textContent = t; cap.classList.remove('pop'); void cap.offsetWidth; cap.classList.add('pop'); },
      move: (sel) => { const el = $(sel); if (!el) return; const p = at(el); cur.style.left = p.x + 'px'; cur.style.top = p.y + 'px'; },
      click: (sel) => { ripple(); const el = sel && $(sel); if (el) { el.classList.add('press'); setTimeout(() => el.classList.remove('press'), 260); } },
      type: (sel, text, ms) => {
        const box = $(sel), t = box.querySelector('.txt') || box; box.classList.add('act'); let i = 0;
        const iv = setInterval(() => { i++; t.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(iv); setTimeout(() => box.classList.remove('act'), 350); } }, Math.max(20, ms / text.length));
        ivs.push(iv);
      },
      set: (sel, html) => { $(sel).innerHTML = html; },
      on: (sel) => $(sel).classList.add('on'),
      stagger: (sel, gap) => dp.querySelectorAll(sel).forEach((e, i) => timers.push(setTimeout(() => e.classList.add('on'), i * gap))),
      count: (sel, to, ms, dec = 2, suffix = '') => { const el = $(sel), t0 = performance.now(); const f = (now) => { const p = Math.min(1, (now - t0) / ms); el.textContent = fmt(to * p, dec) + suffix; if (p < 1) raf(f); }; raf(f); },
      addLine: (name, price, qty, idx) => {
        ctx.cart[idx] = { name, price, qty };
        const rows = Object.values(ctx.cart).filter((x) => x.qty > 0);
        $('#lines').innerHTML = rows.map((r) => `<div class="cl"><span>${r.name} × ${r.qty}</span><b>${fmt(r.price * r.qty)}</b></div>`).join('');
        const sub = rows.reduce((s, r) => s + r.price * r.qty, 0);
        $('#pb').textContent = fmt(sub); $('#pv').textContent = fmt(sub * 0.15); $('#pt').textContent = fmt(sub * 1.15);
      },
    };

    function run() {
      stop();
      ctx.cart = {};
      cur.style.transition = 'none'; cur.style.left = '600px'; cur.style.top = '430px'; void cur.offsetWidth; cur.style.transition = '';
      main.innerHTML = ''; cap.textContent = '';
      prog.style.transition = 'none'; prog.style.width = '0'; void prog.offsetWidth; prog.style.transition = `width ${S.dur}ms linear`; prog.style.width = '100%';
      S.steps.forEach(([t, fn]) => timers.push(setTimeout(() => fn(ctx), t)));
      timers.push(setTimeout(() => {
        host.dispatchEvent(new Event('demodone')); global.__demoDone = true;
        if (opts.loop !== false) timers.push(setTimeout(run, 1600));
      }, S.dur));
    }
    function stop() { timers.forEach(clearTimeout); ivs.forEach(clearInterval); timers = []; ivs = []; }
    return { start: run, stop, fit };
  }

  global.JadaraDemos = { SCRIPTS, mount };
})(window);
