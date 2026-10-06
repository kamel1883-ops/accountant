import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { calcVat } from '../../utils/vatCalculator';
import { purchaseDocPdf } from '../documents/print';
import { SYS } from '../../utils/seedAccounts';
import { assertOnHand } from '../../utils/stockOnHand';
import { alignPerpetualInventory } from '../../utils/perpetual';
import { isKsaVatNumber } from '../zatca/entity';
import { assertCenter, tag } from '../../utils/costCenter';

const router = Router();
router.use(requireAuth);

type LineInput = { productId: string; quantity: number; unitPrice: number };

function computeTotals(lines: LineInput[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const { vat, total } = calcVat(subtotal);
  return { subtotal, vat, total };
}

const docSelect = {
  id: true, type: true, status: true, supplier: true, supplierVat: true, supplierInvoiceNo: true,
  orderRef: true, receiptStatus: true, paymentStatus: true, warehouseId: true, date: true, notes: true,
  subtotal: true, vat: true, total: true, linkedInvoiceId: true, returnOfId: true, createdAt: true,
  attachmentName: true, costCenterId: true, lines: true,
} as const;

function present(doc: any) {
  if (!doc) return doc;
  const { attachmentData, ...rest } = doc;
  return { ...rest, hasFile: Boolean(rest.attachmentName) };
}

function supplierRecord(body: any) {
  const supplierVat = String(body.supplierVat || '').replace(/\s/g, '');
  if (supplierVat && !isKsaVatNumber(supplierVat)) {
    const error = new Error('الرقم الضريبي للمورد يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return {
    supplierVat: supplierVat || null,
    supplierInvoiceNo: String(body.supplierInvoiceNo || '').trim().slice(0, 60) || null,
    orderRef: String(body.orderRef || '').trim().slice(0, 60) || null,
    receiptStatus: body.receiptStatus === 'PARTIAL' ? 'PARTIAL' : 'FULL',
    paymentStatus: body.paymentStatus === 'PAID' ? 'PAID' : 'CREDIT',
  };
}

function readFile(file: any) {
  if (!file || !file.data) return null;
  const buf = Buffer.from(String(file.data).replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!buf.length) return null;
  if (buf.length > 4 * 1024 * 1024) {
    const error = new Error('حجم المرفق أكبر من 4 ميجا') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  const filename = String(file.filename || 'supplier-invoice').slice(0, 120);
  const mime = String(file.mime || 'application/octet-stream').slice(0, 80);
  const allowed = /^(application\/pdf|image\/jpeg|image\/png|image\/webp|text\/xml|application\/xml)$/.test(mime)
    || /\.(pdf|xml|jpe?g|png|webp)$/i.test(filename);
  if (!allowed) {
    const error = new Error('أرفق PDF أو صورة أو ملف XML فقط') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  return { attachmentName: filename, attachmentMime: mime, attachmentData: buf };
}

async function moveStock(tx: any, tenantId: string, productId: string, warehouseId: string, direction: 'IN' | 'OUT', quantity: number, sourceRef: string) {
  await tx.stockMovement.create({ data: { tenantId, productId, warehouseId, type: direction, quantity, sourceRef } });
  const delta = direction === 'OUT' ? -quantity : quantity;
  await tx.stockBalance.upsert({
    where: { productId_warehouseId: { productId, warehouseId } },
    update: { quantity: { increment: delta } },
    create: { productId, warehouseId, quantity: delta },
  });
}

router.get('/', async (req, res) => {
  const { type } = req.query;
  const docs = await prisma.purchaseDoc.findMany({
    where: { tenantId: req.auth!.tenantId, ...(type ? { type: String(type) as any } : {}) },
    select: docSelect,
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs.map(present));
});

function pdfName(number: string) {
  const ascii = String(number || '').replace(/[^\x20-\x7E]/g, '').replace(/["\\]/g, '').trim().slice(0, 40);
  return ascii || 'document';
}

// GET /api/purchases/:id/print
router.get('/:id/print', async (req, res) => {
  try {
    const out = await purchaseDocPdf(req.auth!.tenantId, req.params.id, req.query.lang === 'en' ? 'en' : 'ar');
    if (!out) return res.status(404).json({ error: 'المستند غير موجود' });
    res.type('application/pdf').set('Content-Disposition', `inline; filename="purchase-${pdfName(out.number)}.pdf"`).send(out.pdf);
  } catch (err) {
    console.error('purchase print', err);
    if (!res.headersSent) res.status(500).json({ error: 'تعذّر طباعة فاتورة المشتريات' });
  }
});

router.get('/:id/file', async (req, res) => {
  const doc = await prisma.purchaseDoc.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId },
    select: { attachmentName: true, attachmentMime: true, attachmentData: true },
  });
  if (!doc?.attachmentData) return res.status(404).json({ error: 'لا يوجد مرفق' });
  res.setHeader('Content-Type', doc.attachmentMime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.attachmentName || 'supplier-invoice')}"`);
  res.send(doc.attachmentData);
});

router.get('/:id', async (req, res) => {
  const doc = await prisma.purchaseDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, select: docSelect });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  res.json(present(doc));
});

// POST /api/purchases — create as DRAFT. { type: REQUEST|ORDER|INVOICE|RETURN, supplier, warehouseId, date, notes, lines }
router.post('/', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { type, supplier, warehouseId, date, notes, lines, file, costCenterId } = req.body as { type: string; supplier: string; warehouseId?: string; date?: string; notes?: string; lines: LineInput[]; file?: any; costCenterId?: string };
  if (!type || !supplier || !Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'أكمل بيانات المستند وأضف صنف واحد على الأقل' });
  let extra;
  let stored;
  try {
    extra = supplierRecord(req.body);
    stored = readFile(file);
  } catch (error) {
    return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message });
  }

  const totals = computeTotals(lines);
  const doc = await prisma.purchaseDoc.create({
    data: {
      tenantId: req.auth!.tenantId, type: type as any, supplier, warehouseId, costCenterId: costCenterId || null, notes,
      date: new Date(date || Date.now()), ...totals, ...extra, ...(stored || {}),
      lines: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice })) },
    },
    select: docSelect,
  });
  res.status(201).json(present(doc));
});

router.patch('/:id', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const doc = await prisma.purchaseDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  if (doc.status !== 'DRAFT') return res.status(409).json({ error: 'لا يمكن تعديل مستند مُعتمد' });

  const { supplier, warehouseId, notes, lines, date, file } = req.body as { supplier?: string; warehouseId?: string; notes?: string; lines?: LineInput[]; date?: string; file?: any };
  const data: any = {};
  try {
    Object.assign(data, supplierRecord(req.body));
    const stored = readFile(file);
    if (stored) Object.assign(data, stored);
  } catch (error) {
    return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message });
  }
  if (supplier) data.supplier = supplier;
  if (warehouseId) data.warehouseId = warehouseId;
  if (notes !== undefined) data.notes = notes;
  if (req.body.costCenterId !== undefined) data.costCenterId = req.body.costCenterId || null;
  if (date) data.date = new Date(date);
  if (lines) {
    Object.assign(data, computeTotals(lines));
    await prisma.purchaseDocLine.deleteMany({ where: { docId: doc.id } });
    data.lines = { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice })) };
  }
  const updated = await prisma.purchaseDoc.update({ where: { id: doc.id }, data, select: docSelect });
  res.json(present(updated));
});

// POST /api/purchases/:id/confirm — REQUEST/ORDER just lock; INVOICE/RETURN also
// move stock and post the journal entry, mirroring into Invoice for INVOICE type.
router.post('/:id/confirm', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const doc = await prisma.purchaseDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, include: { lines: true } });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  if (doc.status !== 'DRAFT') return res.status(409).json({ error: 'المستند مُعتمد مسبقاً' });

  if (doc.type === 'REQUEST' || doc.type === 'ORDER') {
    const updated = await prisma.purchaseDoc.update({ where: { id: doc.id }, data: { status: 'CONFIRMED' } });
    return res.json(updated);
  }

  if (!doc.warehouseId) return res.status(400).json({ error: 'اختر المستودع قبل الاعتماد' });
  if (doc.type === 'INVOICE' || doc.type === 'RETURN') {
    try { await assertCenter(req.auth!.tenantId, doc.costCenterId); }
    catch (error) { return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message }); }
  }
  if (doc.type === 'INVOICE' || doc.type === 'RETURN') {
    if (!doc.supplierInvoiceNo) return res.status(400).json({ error: 'أدخل رقم فاتورة المورد قبل الاعتماد' });
    if (!isKsaVatNumber(doc.supplierVat)) return res.status(400).json({ error: 'أدخل الرقم الضريبي للمورد قبل الاعتماد: 15 رقماً يبدأ وينتهي بـ 3' });
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    for (const line of doc.lines) {
      if (doc.type === 'RETURN') await assertOnHand(tx, line.productId, doc.warehouseId!, Number(line.quantity));
      await moveStock(tx, req.auth!.tenantId, line.productId, doc.warehouseId!, doc.type === 'INVOICE' ? 'IN' : 'OUT', Number(line.quantity), `purchaseDoc:${doc.id}`);
    }

    let invoiceId: string | undefined;
    if (doc.type === 'INVOICE') {
      const invoice = await tx.invoice.create({
        data: { tenantId: req.auth!.tenantId, type: 'PURCHASE', party: doc.supplier, descAr: `فاتورة مشتريات — ${doc.supplier}`, subtotal: doc.subtotal, vat: doc.vat, total: doc.total, date: doc.date },
      });
      invoiceId = invoice.id;
      await tx.journalEntry.create({
        data: {
          tenantId: req.auth!.tenantId, date: doc.date, descAr: `قيد تلقائي — فاتورة مشتريات — ${doc.supplier}`, isAuto: true, sourceRef: `purchaseDoc:${doc.id}`,
          lines: { create: tag([{ accountCode: SYS.inventory, debit: doc.subtotal, credit: 0 }, { accountCode: SYS.inputVat, debit: doc.vat, credit: 0 }, { accountCode: SYS.payable, debit: 0, credit: doc.total }], doc.costCenterId) },
        },
      });
    } else {
      await tx.journalEntry.create({
        data: {
          tenantId: req.auth!.tenantId, date: doc.date, descAr: `قيد تلقائي — مرتجع مشتريات — ${doc.supplier}`, isAuto: true, sourceRef: `purchaseDoc:${doc.id}`,
          lines: { create: tag([{ accountCode: SYS.payable, debit: doc.total, credit: 0 }, { accountCode: SYS.inventory, debit: 0, credit: doc.subtotal }, { accountCode: SYS.inputVat, debit: 0, credit: doc.vat }], doc.costCenterId) },
        },
      });
    }

    return tx.purchaseDoc.update({ where: { id: doc.id }, data: { status: 'CONFIRMED', linkedInvoiceId: invoiceId }, include: { lines: true } });
  });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 400) return res.status(400).json({ error: (error as Error).message });
    throw error;
  }

  try { await alignPerpetualInventory(req.auth!.tenantId); }
  catch (error) { console.error('تعذّر مواءمة الجرد المستمر', error); }

  res.json(result);
});

// POST /api/purchases/:id/invoice — copy a request or order into a draft purchase
// invoice. Confirming that invoice is what adds stock and posts the journal.
router.post('/:id/invoice', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const doc = await prisma.purchaseDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, include: { lines: true } });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  if (doc.type !== 'REQUEST' && doc.type !== 'ORDER') return res.status(400).json({ error: 'فاتورة الاستلام تُنشأ من طلب الشراء أو أمر الشراء فقط' });
  if (doc.lines.length === 0) return res.status(400).json({ error: 'المستند بلا أصناف' });

  const warehouseId = String(req.body?.warehouseId || doc.warehouseId || '');
  if (!warehouseId) return res.status(400).json({ error: 'اختر المستودع قبل إنشاء فاتورة الاستلام' });
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, tenantId: req.auth!.tenantId } });
  if (!warehouse) return res.status(400).json({ error: 'المستودع غير موجود' });

  const existing = await prisma.purchaseDoc.findFirst({ where: { tenantId: req.auth!.tenantId, returnOfId: doc.id, type: 'INVOICE' } });
  if (existing) {
    return res.status(409).json({ error: existing.status === 'CONFIRMED' ? 'استُلمت هذه البضاعة بفاتورة مشتريات مسبقاً' : 'فاتورة الاستلام موجودة كمسودة. اعتمدها من تبويب فاتورة المشتريات.' });
  }

  const lines = doc.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }));
  const totals = computeTotals(lines);
  const created = await prisma.$transaction(async (tx) => {
    if (doc.status === 'DRAFT') {
      await tx.purchaseDoc.update({ where: { id: doc.id }, data: { status: 'CONFIRMED', warehouseId } });
    } else if (doc.warehouseId !== warehouseId) {
      await tx.purchaseDoc.update({ where: { id: doc.id }, data: { warehouseId } });
    }
    return tx.purchaseDoc.create({
      data: {
        tenantId: req.auth!.tenantId, type: 'INVOICE', supplier: doc.supplier, warehouseId, date: doc.date,
        notes: doc.type === 'ORDER' ? 'استلام أمر شراء' : 'استلام طلب شراء', returnOfId: doc.id, ...totals,
        lines: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice })) },
      },
      include: { lines: true },
    });
  });
  res.status(201).json(created);
});

export default router;
