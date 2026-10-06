import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { prisma } from '../../config/db';
import {
  buildBalances, sumBy, listBy, netProfitOf, round2, totalEquityPosted,
} from '../../utils/accounting';

type Cell = string | number | null;
type Grid = Cell[][];

const day = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : '');
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
const txt = (v: unknown) => (v == null ? '' : String(v));

function book() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jadara Finance';
  wb.created = new Date();
  return wb;
}

function sheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: Grid) {
  const safe = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  const ws = wb.addWorksheet(safe);
  ws.views = [{ rightToLeft: true, state: 'frozen', ySplit: 1 }];
  const head = ws.addRow(headers);
  head.font = { bold: true };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF151340' } };
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  if (!rows.length) ws.addRow(['لا توجد بيانات في هذا القسم']);
  else rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col) => { col.width = 22; });
  return ws;
}

async function file(zip: JSZip, name: string, wb: ExcelJS.Workbook) {
  const buf = await wb.xlsx.writeBuffer();
  zip.file(name, Buffer.from(buf));
}

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'jadara';
}

export async function buildCompanyZip(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      companyName: true, unifiedNumber: true, vatNumber: true, activity: true, fiscalYear: true, createdAt: true,
      subscription: { select: { plan: true, status: true, startDate: true, endDate: true, trialEndsAt: true, createdAt: true } },
      branches: { select: { id: true, nameAr: true, nameEn: true, isMain: true, createdAt: true } },
    },
  });
  if (!tenant) throw new Error('المنشأة غير موجودة');

  const from = tenant.subscription?.startDate || tenant.createdAt;
  const to = new Date();

  const [
    users, accounts, entries, sales, purchases, categories, units, products, warehouses,
    balances, movements, counts, treasuries, vouchers, years, invoices, submissions, audits,
    discounts, tickets, logs,
  ] = await Promise.all([
    prisma.user.findMany({
      where: { tenantId },
      select: {
        id: true, nameAr: true, nameEn: true, email: true, role: true, createdAt: true, branchId: true,
        emailHistory: { select: { email: true, changedAt: true }, orderBy: { changedAt: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.account.findMany({ where: { tenantId }, orderBy: { code: 'asc' } }),
    prisma.journalEntry.findMany({
      where: { tenantId },
      include: { lines: true },
      orderBy: [{ date: 'asc' }, { number: 'asc' }],
    }),
    prisma.salesDoc.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { date: 'asc' } }),
    prisma.purchaseDoc.findMany({
      where: { tenantId },
      select: {
        type: true, status: true, supplier: true, supplierVat: true, supplierInvoiceNo: true,
        orderRef: true, receiptStatus: true, paymentStatus: true, attachmentName: true,
        date: true, warehouseId: true, subtotal: true, vat: true, total: true, notes: true, lines: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.productCategory.findMany({ where: { tenantId }, orderBy: { nameAr: 'asc' } }),
    prisma.unit.findMany({ where: { tenantId }, orderBy: { nameAr: 'asc' } }),
    prisma.product.findMany({ where: { tenantId }, orderBy: { sku: 'asc' } }),
    prisma.warehouse.findMany({ where: { tenantId }, orderBy: { nameAr: 'asc' } }),
    prisma.stockBalance.findMany({ where: { product: { tenantId } } }),
    prisma.stockMovement.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.stockCount.findMany({ where: { tenantId }, include: { lines: true }, orderBy: { createdAt: 'asc' } }),
    prisma.treasury.findMany({ where: { tenantId }, orderBy: { nameAr: 'asc' } }),
    prisma.voucher.findMany({ where: { tenantId }, orderBy: { date: 'asc' } }),
    prisma.fiscalYear.findMany({ where: { tenantId }, orderBy: { startDate: 'asc' } }),
    prisma.invoice.findMany({
      where: { tenantId },
      select: {
        id: true, type: true, party: true, descAr: true, subtotal: true, vat: true, total: true, date: true,
        zatcaKind: true, zatcaStatus: true, uuid: true, icv: true, createdAt: true,
      },
      orderBy: { date: 'asc' },
    }),
    prisma.zatcaSubmission.findMany({
      where: { tenantId },
      select: { id: true, invoiceId: true, salesDocId: true, kind: true, uuid: true, httpStatus: true, status: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.zatcaAudit.findMany({
      where: { tenantId },
      select: { userId: true, action: true, reason: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.saleDiscountCode.findMany({ where: { tenantId }, orderBy: { createdAt: 'asc' } }),
    prisma.supportTicket.findMany({
      where: { tenantId },
      include: { messages: { include: { attachments: { select: { filename: true, mime: true } } }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.auditLog.findMany({
      where: { tenantId },
      select: { userId: true, action: true, resource: true, result: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const branchName = new Map(tenant.branches.map((b) => [b.id, b.nameAr]));
  const productName = new Map(products.map((p) => [p.id, `${p.sku} — ${p.nameAr}`]));
  const warehouseName = new Map(warehouses.map((w) => [w.id, w.nameAr]));
  const treasuryName = new Map(treasuries.map((t) => [t.id, t.nameAr]));
  const categoryName = new Map(categories.map((c) => [c.id, c.nameAr]));
  const unitName = new Map(units.map((u) => [u.id, u.nameAr]));

  const zip = new JSZip();

  const cover = book();
  sheet(cover, 'عن الملف', ['البند', 'القيمة'], [
    ['المنشأة', tenant.companyName],
    ['الرقم الموحّد', tenant.unifiedNumber],
    ['الرقم الضريبي', txt(tenant.vatNumber)],
    ['النشاط', txt(tenant.activity)],
    ['تاريخ فتح الحساب', day(tenant.createdAt)],
    ['بداية الاشتراك', day(tenant.subscription?.startDate || tenant.createdAt)],
    ['نهاية الاشتراك', day(tenant.subscription?.endDate)],
    ['الخطة', txt(tenant.subscription?.plan)],
    ['حالة الاشتراك', txt(tenant.subscription?.status)],
    ['تاريخ تجهيز الملف', day(to)],
    ['المصدر', 'جداره Finance'],
    ['ملاحظة', 'هذا أرشيف بيانات المنشأة من أول يوم. لا يتضمن كلمات المرور ولا مفاتيح الفوترة الإلكترونية ولا ملفات المرفقات.'],
  ]);
  await file(zip, '00-عن-التصدير.xlsx', cover);

  const org = book();
  sheet(org, 'الفروع', ['الاسم', 'الاسم بالإنجليزية', 'فرع رئيسي', 'تاريخ الإنشاء'], tenant.branches.map((b) => [
    b.nameAr, txt(b.nameEn), b.isMain ? 'نعم' : 'لا', day(b.createdAt),
  ]));
  sheet(org, 'المستخدمون', ['الاسم', 'الاسم بالإنجليزية', 'البريد', 'الصلاحية', 'الفرع', 'تاريخ الإنشاء'], users.map((u) => [
    u.nameAr, txt(u.nameEn), u.email, u.role, u.branchId ? txt(branchName.get(u.branchId)) : '', day(u.createdAt),
  ]));
  sheet(org, 'البريد السابق', ['الاسم', 'البريد السابق', 'تاريخ التغيير'], users.flatMap((u) => u.emailHistory.map((h) => [
    u.nameAr, h.email, day(h.changedAt),
  ])));
  await file(zip, '01-المنشأة-والمستخدمون.xlsx', org);

  const coa = book();
  sheet(coa, 'دليل الحسابات', ['الرمز', 'الاسم', 'الاسم بالإنجليزية', 'النوع', 'التصنيف', 'حساب تجميعي', 'حساب أساسي', 'نشط'], accounts.map((a) => [
    a.code, a.nameAr, a.nameEn, a.type, txt(a.subtype), a.isGroup ? 'نعم' : 'لا', a.isSystem ? 'نعم' : 'لا', a.active ? 'نعم' : 'لا',
  ]));
  await file(zip, '02-دليل-الحسابات.xlsx', coa);

  const journal = book();
  sheet(journal, 'القيود', ['رقم القيد', 'التاريخ', 'النوع', 'البيان', 'البيان بالإنجليزية', 'قيد تلقائي', 'مرجع المصدر'], entries.map((e) => [
    e.number ?? '', day(e.date), e.kind, e.descAr, txt(e.descEn), e.isAuto ? 'نعم' : 'لا', txt(e.sourceRef),
  ]));
  sheet(journal, 'سطور القيود', ['رقم القيد', 'التاريخ', 'رمز الحساب', 'بيان السطر', 'مدين', 'دائن'], entries.flatMap((e) => e.lines.map((l) => [
    e.number ?? '', day(e.date), l.accountCode, txt(l.descAr), num(l.debit), num(l.credit),
  ])));
  await file(zip, '03-القيود-اليومية.xlsx', journal);

  const { rows } = await buildBalances(tenantId, { to, includeClosing: true });
  const trial = book();
  sheet(trial, 'ميزان المراجعة', ['الرمز', 'الاسم', 'النوع', 'التصنيف', 'مدين افتتاحي', 'دائن افتتاحي', 'مدين', 'دائن', 'الرصيد'], rows.map((r) => [
    r.code, r.nameAr, r.type, txt(r.subtype), r.openingDebit, r.openingCredit, r.debit, r.credit, r.balance,
  ]));
  await file(zip, '04-ميزان-المراجعة.xlsx', trial);

  const lifeFrom = new Date(from);
  lifeFrom.setHours(0, 0, 0, 0);
  const { rows: lifeRows } = await buildBalances(tenantId, { from: lifeFrom, to, includeClosing: false });
  const inPeriod = lifeRows.map((r) => ({ ...r, balance: round2(r.balance - r.openingBalance) }));
  const salesRev = sumBy(inPeriod, (r) => r.subtype === 'SALES_REVENUE');
  const salesRet = sumBy(inPeriod, (r) => r.subtype === 'SALES_RETURNS');
  const netSales = round2(salesRev - salesRet);
  const purchCost = sumBy(inPeriod, (r) => r.subtype === 'PURCHASES_COST');
  const purchRet = sumBy(inPeriod, (r) => r.subtype === 'PURCHASE_RETURNS');
  const cogs = round2(purchCost - purchRet);
  const gross = round2(netSales - cogs);
  const operating = sumBy(inPeriod, (r) => r.subtype === 'OPERATING_EXPENSE' || r.subtype === 'DEPRECIATION');
  const opProfit = round2(gross - operating);
  const otherIn = sumBy(inPeriod, (r) => r.subtype === 'OTHER_INCOME');
  const otherEx = sumBy(inPeriod, (r) => r.subtype === 'OTHER_EXPENSE');
  const net = round2(opProfit + otherIn - otherEx);

  const income = book();
  sheet(income, 'قائمة الدخل', ['البند', 'المبلغ'], [
    ['من', day(lifeFrom)],
    ['إلى', day(to)],
    ['المبيعات', salesRev],
    ['مردودات المبيعات', salesRet],
    ['صافي المبيعات', netSales],
    ['المشتريات', purchCost],
    ['مردودات المشتريات', purchRet],
    ['تكلفة البضاعة المباعة', cogs],
    ['مجمل الربح', gross],
    ['المصروفات التشغيلية', operating],
    ['الربح التشغيلي', opProfit],
    ['إيرادات أخرى', otherIn],
    ['مصروفات أخرى', otherEx],
    ['صافي الربح', net],
  ]);
  sheet(income, 'تفاصيل الدخل', ['الرمز', 'الاسم', 'التصنيف', 'المبلغ'], listBy(inPeriod, (r) => r.type === 'SALES' || r.type === 'PURCHASES').map((i) => {
    const src = inPeriod.find((r) => r.code === i.code);
    return [i.code, i.nameAr, txt(src?.subtype), i.amount];
  }));
  await file(zip, '05-قائمة-الدخل.xlsx', income);

  const { rows: bsRows } = await buildBalances(tenantId, { to, includeClosing: false });
  const currentLines = listBy(bsRows, (r) => r.subtype === 'CURRENT_ASSET' || r.subtype === 'CASH');
  const currentAssets = sumBy(bsRows, (r) => r.subtype === 'CURRENT_ASSET' || r.subtype === 'CASH');
  const nonCurrentGross = sumBy(bsRows, (r) => r.subtype === 'NON_CURRENT_ASSET');
  const accumDep = sumBy(bsRows, (r) => r.subtype === 'CONTRA_ASSET');
  const nonCurrentAssets = round2(nonCurrentGross - accumDep);
  const assetsTotal = round2(currentAssets + nonCurrentAssets);
  const currentLiab = sumBy(bsRows, (r) => r.subtype === 'CURRENT_LIABILITY');
  const nonCurrentLiab = sumBy(bsRows, (r) => r.subtype === 'NON_CURRENT_LIABILITY');
  const totalLiab = round2(currentLiab + nonCurrentLiab);
  const equityPosted = totalEquityPosted(bsRows);
  const result = netProfitOf(bsRows);
  const totalEquity = round2(equityPosted + result);
  const bs = book();
  const bsItems = (pred: (r: typeof bsRows[number]) => boolean, section: string) =>
    listBy(bsRows, pred).map((i) => [section, i.code, i.nameAr, i.amount] as Cell[]);
  sheet(bs, 'المركز المالي', ['القسم', 'الرمز', 'الاسم', 'المبلغ'], [
    ['كما في', '', '', day(to)],
    ['أصول متداولة', '', 'الإجمالي', currentAssets],
    ...currentLines.filter((i) => Math.abs(i.amount) > 0.004).map((i) => ['أصول متداولة', i.code, i.nameAr, i.amount] as Cell[]),
    ['أصول غير متداولة', '', 'الإجمالي', nonCurrentAssets],
    ...bsItems((r) => r.subtype === 'NON_CURRENT_ASSET' || r.subtype === 'CONTRA_ASSET', 'أصول غير متداولة'),
    ['مجموع الأصول', '', '', assetsTotal],
    ['خصوم متداولة', '', 'الإجمالي', currentLiab],
    ...bsItems((r) => r.subtype === 'CURRENT_LIABILITY', 'خصوم متداولة'),
    ['خصوم غير متداولة', '', 'الإجمالي', nonCurrentLiab],
    ...bsItems((r) => r.subtype === 'NON_CURRENT_LIABILITY', 'خصوم غير متداولة'),
    ['مجموع الخصوم', '', '', totalLiab],
    ['حقوق الملكية', '', 'المسجّل', equityPosted],
    ...bsItems((r) => r.type === 'EQUITY', 'حقوق الملكية'),
    ['نتيجة الفترة', '', '', result],
    ['مجموع حقوق الملكية', '', '', totalEquity],
    ['الخصوم وحقوق الملكية', '', '', round2(totalLiab + totalEquity)],
  ]);
  await file(zip, '06-المركز-المالي.xlsx', bs);

  const movement = (pred: (r: typeof lifeRows[number]) => boolean) => ({
    opening: sumBy(lifeRows.map((r) => ({ ...r, balance: r.openingBalance })), pred),
    change: sumBy(inPeriod, pred),
    closing: sumBy(lifeRows, pred),
  });
  const capital = movement((r) => r.subtype === 'CAPITAL');
  const reserves = movement((r) => r.subtype === 'RESERVES');
  const retained = movement((r) => r.subtype === 'RETAINED_EARNINGS');
  const drawings = movement((r) => r.subtype === 'DRAWINGS');
  const profit = netProfitOf(inPeriod);
  const equity = book();
  sheet(equity, 'حقوق الملكية', ['البند', 'أول المدة', 'الحركة', 'آخر المدة'], [
    ['رأس المال', capital.opening, capital.change, capital.closing],
    ['الاحتياطيات', reserves.opening, reserves.change, reserves.closing],
    ['الأرباح المبقاة', retained.opening, retained.change, retained.closing],
    ['المسحوبات', drawings.opening, drawings.change, drawings.closing],
    ['ربح الفترة', 0, profit, profit],
  ]);
  await file(zip, '07-التغير-في-حقوق-الملكية.xlsx', equity);

  const change = (pred: (r: typeof lifeRows[number]) => boolean) => sumBy(inPeriod, pred);
  const depreciation = change((r) => r.subtype === 'DEPRECIATION');
  const wcAssets = -change((r) => r.subtype === 'CURRENT_ASSET');
  const wcLiab = change((r) => r.subtype === 'CURRENT_LIABILITY');
  const opCash = round2(profit + depreciation + wcAssets + wcLiab);
  const investing = round2(-change((r) => r.subtype === 'NON_CURRENT_ASSET'));
  const financing = round2(change((r) => r.subtype === 'CAPITAL') + change((r) => r.subtype === 'NON_CURRENT_LIABILITY') - change((r) => r.subtype === 'DRAWINGS'));
  const openingCash = sumBy(lifeRows.map((r) => ({ ...r, balance: r.openingBalance })), (r) => r.subtype === 'CASH');
  const closingCash = sumBy(lifeRows, (r) => r.subtype === 'CASH');
  const cash = book();
  sheet(cash, 'التدفقات النقدية', ['البند', 'المبلغ'], [
    ['صافي الربح', profit],
    ['الإهلاك', depreciation],
    ['التغير في الأصول المتداولة', wcAssets],
    ['التغير في الخصوم المتداولة', wcLiab],
    ['التدفقات التشغيلية', opCash],
    ['التدفقات الاستثمارية', investing],
    ['التدفقات التمويلية', financing],
    ['صافي التغير', round2(opCash + investing + financing)],
    ['النقد أول المدة', openingCash],
    ['النقد آخر المدة', closingCash],
  ]);
  await file(zip, '08-التدفقات-النقدية.xlsx', cash);

  const salesBook = book();
  sheet(salesBook, 'المستندات', ['النوع', 'الحالة', 'العميل', 'الرقم الضريبي', 'التاريخ', 'مستودع', 'نقطة بيع', 'قبل الخصم', 'الخصم', 'نسبة الخصم', 'كود الخصم', 'الصافي', 'الضريبة', 'الإجمالي', 'ملاحظات'], sales.map((d) => [
    d.type, d.status, d.customer, txt(d.customerVat), day(d.date), d.warehouseId ? txt(warehouseName.get(d.warehouseId)) : '', d.isPos ? 'نعم' : 'لا',
    round2(num(d.subtotal) + num(d.discount)), num(d.discount), num(d.discountPercent), txt(d.discountCode), num(d.subtotal), num(d.vat), num(d.total), txt(d.notes),
  ]));
  sheet(salesBook, 'البنود', ['النوع', 'العميل', 'التاريخ', 'المنتج', 'الكمية', 'سعر الوحدة', 'الإجمالي'], sales.flatMap((d) => d.lines.map((l) => [
    d.type, d.customer, day(d.date), txt(productName.get(l.productId)), num(l.quantity), num(l.unitPrice), num(l.lineTotal),
  ])));
  await file(zip, '09-المبيعات.xlsx', salesBook);

  const buy = book();
  sheet(buy, 'المستندات', ['النوع', 'الحالة', 'المورد', 'الرقم الضريبي', 'رقم فاتورة المورد', 'مرجع الأمر', 'الاستلام', 'السداد', 'التاريخ', 'مستودع', 'الصافي', 'الضريبة', 'الإجمالي', 'المرفق', 'ملاحظات'], purchases.map((d) => [
    d.type, d.status, d.supplier, txt(d.supplierVat), txt(d.supplierInvoiceNo), txt(d.orderRef), d.receiptStatus, d.paymentStatus, day(d.date), d.warehouseId ? txt(warehouseName.get(d.warehouseId)) : '', num(d.subtotal), num(d.vat), num(d.total), txt(d.attachmentName), txt(d.notes),
  ]));
  sheet(buy, 'البنود', ['النوع', 'المورد', 'التاريخ', 'المنتج', 'الكمية', 'سعر الوحدة', 'الإجمالي'], purchases.flatMap((d) => d.lines.map((l) => [
    d.type, d.supplier, day(d.date), txt(productName.get(l.productId)), num(l.quantity), num(l.unitPrice), num(l.lineTotal),
  ])));
  await file(zip, '10-المشتريات.xlsx', buy);

  const catalog = book();
  sheet(catalog, 'التصنيفات', ['الاسم', 'الاسم بالإنجليزية'], categories.map((c) => [c.nameAr, txt(c.nameEn)]));
  sheet(catalog, 'الوحدات', ['الاسم', 'الاسم بالإنجليزية'], units.map((u) => [u.nameAr, txt(u.nameEn)]));
  sheet(catalog, 'المنتجات', ['الرمز', 'الاسم', 'الاسم بالإنجليزية', 'التصنيف', 'الوحدة', 'التكلفة', 'سعر البيع', 'حد الطلب', 'منتج مجمّع'], products.map((p) => [
    p.sku, p.nameAr, txt(p.nameEn), p.categoryId ? txt(categoryName.get(p.categoryId)) : '', p.unitId ? txt(unitName.get(p.unitId)) : '',
    num(p.costPrice), num(p.sellPrice), num(p.reorderPoint), p.isBundle ? 'نعم' : 'لا',
  ]));
  await file(zip, '11-المنتجات.xlsx', catalog);

  const stock = book();
  sheet(stock, 'المستودعات', ['الاسم', 'الفرع'], warehouses.map((w) => [w.nameAr, txt(branchName.get(w.branchId))]));
  sheet(stock, 'الأرصدة', ['المنتج', 'المستودع', 'الكمية'], balances.map((b) => [
    txt(productName.get(b.productId)), txt(warehouseName.get(b.warehouseId)), num(b.quantity),
  ]));
  sheet(stock, 'الحركات', ['التاريخ', 'المنتج', 'المستودع', 'النوع', 'الكمية', 'السبب', 'المرجع'], movements.map((m) => [
    day(m.createdAt), txt(productName.get(m.productId)), txt(warehouseName.get(m.warehouseId)), m.type, num(m.quantity), txt(m.reason), txt(m.sourceRef),
  ]));
  sheet(stock, 'الجرد', ['التاريخ', 'المستودع', 'الحالة', 'تاريخ الاعتماد', 'المنتج', 'الكمية المتوقعة', 'الكمية المعدودة'], counts.flatMap((c) => (
    c.lines.length ? c.lines.map((l) => [
      day(c.createdAt), txt(warehouseName.get(c.warehouseId)), c.status, day(c.submittedAt), txt(productName.get(l.productId)), num(l.expectedQty), l.countedQty == null ? '' : num(l.countedQty),
    ]) : [[day(c.createdAt), txt(warehouseName.get(c.warehouseId)), c.status, day(c.submittedAt), '', '', '']]
  )));
  await file(zip, '12-المخزون.xlsx', stock);

  const fin = book();
  sheet(fin, 'الخزائن', ['الاسم', 'النوع', 'حساب الأستاذ'], treasuries.map((t) => [t.nameAr, t.type, t.accountCode]));
  sheet(fin, 'السندات', ['التاريخ', 'النوع', 'الخزينة', 'الطرف', 'المبلغ', 'الحساب المقابل', 'البيان'], vouchers.map((v) => [
    day(v.date), v.type, txt(treasuryName.get(v.treasuryId)), v.party, num(v.amount), v.counterAccountCode, v.descAr,
  ]));
  await file(zip, '13-المالية.xlsx', fin);

  const periods = book();
  sheet(periods, 'السنوات المالية', ['الاسم', 'من', 'إلى', 'مقفلة', 'تاريخ الإقفال'], years.map((y) => [
    y.name, day(y.startDate), day(y.endDate), y.closed ? 'نعم' : 'لا', day(y.closedAt),
  ]));
  await file(zip, '14-الفترات-المالية.xlsx', periods);

  const vatMap = new Map<string, { outBase: number; outVat: number; inBase: number; inVat: number }>();
  for (const inv of invoices) {
    const d = inv.date;
    const key = `${d.getFullYear()}-Q${Math.ceil((d.getMonth() + 1) / 3)}`;
    const row = vatMap.get(key) || { outBase: 0, outVat: 0, inBase: 0, inVat: 0 };
    if (inv.type === 'SALE') { row.outBase += num(inv.subtotal); row.outVat += num(inv.vat); }
    else if (inv.type === 'PURCHASE') { row.inBase += num(inv.subtotal); row.inVat += num(inv.vat); }
    vatMap.set(key, row);
  }
  const vat = book();
  sheet(vat, 'الفواتير الضريبية', ['التاريخ', 'النوع', 'الطرف', 'البيان', 'الصافي', 'الضريبة', 'الإجمالي', 'حالة الفوترة'], invoices.map((i) => [
    day(i.date), i.type, i.party, i.descAr, num(i.subtotal), num(i.vat), num(i.total), txt(i.zatcaStatus),
  ]));
  sheet(vat, 'ملخص ربعي', ['الفترة', 'وعاء المخرجات', 'ضريبة المخرجات', 'وعاء المدخلات', 'ضريبة المدخلات', 'الصافي'], [...vatMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [
    k, round2(v.outBase), round2(v.outVat), round2(v.inBase), round2(v.inVat), round2(v.outVat - v.inVat),
  ]));
  await file(zip, '15-ضريبة-القيمة-المضافة.xlsx', vat);

  const zatca = book();
  sheet(zatca, 'الإرسالات', ['التاريخ', 'النوع', 'الحالة', 'رمز الاستجابة', 'المعرّف'], submissions.map((s) => [
    day(s.createdAt), s.kind, s.status, s.httpStatus ?? '', s.uuid,
  ]));
  sheet(zatca, 'سجل الشهادة', ['التاريخ', 'الإجراء', 'السبب'], audits.map((a) => [day(a.createdAt), a.action, a.reason]));
  await file(zip, '16-الفوترة-الإلكترونية.xlsx', zatca);

  const codes = book();
  sheet(codes, 'أكواد الخصم', ['الكود', 'النسبة', 'نشط', 'مرات الاستخدام', 'ملاحظة', 'تاريخ الإنشاء'], discounts.map((c) => [
    c.code, num(c.percent), c.active ? 'نعم' : 'لا', c.usedCount, txt(c.note), day(c.createdAt),
  ]));
  await file(zip, '17-أكواد-الخصم.xlsx', codes);

  const support = book();
  sheet(support, 'التذاكر', ['التاريخ', 'الموضوع', 'التصنيف', 'الحالة', 'آخر تحديث', 'تاريخ الإغلاق'], tickets.map((t) => [
    day(t.createdAt), t.subject, t.category, t.status, day(t.updatedAt), day(t.resolvedAt),
  ]));
  sheet(support, 'الرسائل', ['التذكرة', 'التاريخ', 'المرسل', 'النص', 'أسماء المرفقات'], tickets.flatMap((t) => t.messages.map((m) => [
    t.subject, day(m.createdAt), m.fromRole, m.body, m.attachments.map((a) => a.filename).join('، '),
  ])));
  await file(zip, '18-الدعم-الفني.xlsx', support);

  const auditBook = book();
  sheet(auditBook, 'سجل التدقيق', ['التاريخ', 'الإجراء', 'المورد', 'النتيجة'], logs.map((l) => [
    l.createdAt.toISOString(), l.action, txt(l.resource), l.result,
  ]));
  await file(zip, '19-سجل-التدقيق.xlsx', auditBook);

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  const filename = `جداره-${safeName(tenant.companyName)}-${day(to)}.zip`;
  return { filename, buffer };
}
