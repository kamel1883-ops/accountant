import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { applyPercentDiscount, round2, salesPosting } from '../../utils/saleDiscount';
import { buildZatcaTlvBase64 } from '../../utils/zatcaQr';
import { salesDocPdf } from '../documents/print';
import { SYS } from '../../utils/seedAccounts';
import { issueCost } from '../../utils/inventoryValue';
import { assertCenter, tag } from '../../utils/costCenter';
import { assertOnHand } from '../../utils/stockOnHand';
import { queueZatcaSubmit } from '../zatca/submit';
import { isKsaVatNumber } from '../zatca/entity';
import { randomUUID } from 'crypto';

const router = Router();
router.use(requireAuth);

type LineInput = { productId: string; quantity: number; unitPrice: number };

async function priceLines(tenantId: string, lines: LineInput[], code: unknown) {
  const raw = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  const gross = round2(lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitPrice), 0));
  if (!raw) return { error: '', ...applyPercentDiscount(gross, 0), code: null as string | null };
  const row = await prisma.saleDiscountCode.findFirst({ where: { tenantId, code: raw, active: true } });
  if (!row) return { error: 'كود الخصم غير صحيح أو موقوف', ...applyPercentDiscount(gross, 0), code: null as string | null };
  return { error: '', ...applyPercentDiscount(gross, Number(row.percent)), code: row.code };
}

function withCost(lines: { accountCode: string; debit: number; credit: number }[], cost: number, kind: 'SALE' | 'RETURN') {
  if (!(cost > 0)) return lines;
  if (kind === 'RETURN') {
    return [...lines, { accountCode: SYS.inventory, debit: cost, credit: 0 }, { accountCode: SYS.cogs, debit: 0, credit: cost }];
  }
  return [...lines, { accountCode: SYS.cogs, debit: cost, credit: 0 }, { accountCode: SYS.inventory, debit: 0, credit: cost }];
}

function docMoney(p: { net: number; vat: number; total: number; discount: number; percent: number; code: string | null }) {
  return { subtotal: p.net, vat: p.vat, total: p.total, discount: p.discount, discountPercent: p.percent, discountCode: p.code };
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

// GET /api/sales?type=INVOICE — list, optionally filtered by document type
router.get('/', async (req, res) => {
  const { type } = req.query;
  const docs = await prisma.salesDoc.findMany({
    where: { tenantId: req.auth!.tenantId, ...(type ? { type: String(type) as any } : {}) },
    include: { lines: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(docs);
});

// GET /api/sales/:id/print — طباعة الفاتورة أو عرض السعر أو المرتجع
router.get('/:id/print', async (req, res) => {
  const out = await salesDocPdf(req.auth!.tenantId, req.params.id, req.query.lang === 'en' ? 'en' : 'ar');
  if (!out) return res.status(404).json({ error: 'المستند غير موجود' });
  res.type('application/pdf').set('Content-Disposition', `inline; filename="sales-${out.number}.pdf"`).send(out.pdf);
});

router.get('/:id', async (req, res) => {
  const doc = await prisma.salesDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, include: { lines: true } });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  res.json(doc);
});

// POST /api/sales — create a document as DRAFT. { type, customer, warehouseId, date, notes, lines: [{productId, quantity, unitPrice}] }
router.post('/', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { type, customer, warehouseId, date, notes, lines, customerVat, discountCode, costCenterId } = req.body as { type: string; customer: string; warehouseId?: string; date?: string; notes?: string; lines: LineInput[]; customerVat?: string; discountCode?: string; costCenterId?: string };
  if (!type || !customer || !Array.isArray(lines) || lines.length === 0) return res.status(400).json({ error: 'أكمل بيانات المستند وأضف صنف واحد على الأقل' });

  const priced = await priceLines(req.auth!.tenantId, lines, discountCode);
  if (priced.error) return res.status(400).json({ error: priced.error });
  const vat = isKsaVatNumber(customerVat);
  if (String(customerVat || '').trim() && !vat) {
    return res.status(400).json({ error: 'الرقم الضريبي للمشتري يجب أن يكون 15 رقماً يبدأ وينتهي بالرقم 3. اتركه فارغاً إذا كان العميل فرداً.' });
  }
  const doc = await prisma.salesDoc.create({
    data: {
      tenantId: req.auth!.tenantId, type: type as any, customer, warehouseId, costCenterId: costCenterId || null, notes, customerVat: vat || null, zatcaKind: vat ? 'STANDARD' : 'SIMPLIFIED',
      date: new Date(date || Date.now()), ...docMoney(priced),
      lines: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice })) },
    },
    include: { lines: true },
  });
  res.status(201).json(doc);
});

// PATCH /api/sales/:id — edit lines/customer while still a DRAFT
router.patch('/:id', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const doc = await prisma.salesDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  if (doc.status !== 'DRAFT') return res.status(409).json({ error: 'لا يمكن تعديل مستند مُعتمد' });

  const { customer, warehouseId, notes, lines, discountCode, costCenterId } = req.body as { customer?: string; warehouseId?: string; notes?: string; lines?: LineInput[]; discountCode?: string; costCenterId?: string };
  const data: any = {};
  if (customer) data.customer = customer;
  if (warehouseId) data.warehouseId = warehouseId;
  if (notes !== undefined) data.notes = notes;
  if (costCenterId !== undefined) data.costCenterId = costCenterId || null;
  if (lines || discountCode !== undefined) {
    const useLines = lines || (await prisma.salesDocLine.findMany({ where: { docId: doc.id } })).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }));
    const priced = await priceLines(req.auth!.tenantId, useLines, discountCode !== undefined ? discountCode : doc.discountCode);
    if (priced.error) return res.status(400).json({ error: priced.error });
    Object.assign(data, docMoney(priced));
    if (lines) {
      await prisma.salesDocLine.deleteMany({ where: { docId: doc.id } });
      data.lines = { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice })) };
    }
  }
  const updated = await prisma.salesDoc.update({ where: { id: doc.id }, data, include: { lines: true } });
  res.json(updated);
});

// POST /api/sales/:id/confirm — locks the document; for INVOICE/RETURN types, also
// deducts/restores stock and posts the matching journal entry (mirrored into Invoice
// for INVOICE type, so existing VAT-return/reporting code keeps working unchanged).
router.post('/:id/confirm', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const doc = await prisma.salesDoc.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId }, include: { lines: true } });
  if (!doc) return res.status(404).json({ error: 'المستند غير موجود' });
  if (doc.status !== 'DRAFT') return res.status(409).json({ error: 'المستند مُعتمد مسبقاً' });

  if (doc.type === 'QUOTATION' || doc.type === 'ORDER') {
    const updated = await prisma.salesDoc.update({ where: { id: doc.id }, data: { status: 'CONFIRMED' } });
    return res.json(updated);
  }

  if ((doc.type === 'INVOICE' || doc.type === 'RETURN') && !doc.warehouseId) {
    return res.status(400).json({ error: 'اختر المستودع قبل الاعتماد' });
  }
  if (doc.type === 'INVOICE' || doc.type === 'RETURN') {
    try { await assertCenter(req.auth!.tenantId, doc.costCenterId); }
    catch (error) { return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message }); }
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });
  const goodsCost = (doc.type === 'INVOICE' || doc.type === 'RETURN')
    ? await issueCost(req.auth!.tenantId, doc.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })))
    : 0;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    for (const line of doc.lines) {
      if (doc.type === 'INVOICE') await assertOnHand(tx, line.productId, doc.warehouseId!, Number(line.quantity));
      await moveStock(tx, req.auth!.tenantId, line.productId, doc.warehouseId!, doc.type === 'INVOICE' ? 'OUT' : 'IN', Number(line.quantity), `salesDoc:${doc.id}`);
    }

    let invoiceId: string | undefined;
    if (doc.type === 'INVOICE') {
      const zatcaQr = buildZatcaTlvBase64({
        sellerName: tenant?.companyName || 'جداره للمحاسبة المالية', vatNumber: tenant?.vatNumber || '',
        timestampIso: new Date().toISOString(), totalWithVat: Number(doc.total), vatAmount: Number(doc.vat),
      });
      const invoice = await tx.invoice.create({
        data: {
          tenantId: req.auth!.tenantId, type: 'SALE', party: doc.customer, descAr: `فاتورة مبيعات — ${doc.customer}`,
          subtotal: doc.subtotal, vat: doc.vat, total: doc.total, date: doc.date, zatcaQr,
          uuid: randomUUID(), zatcaKind: doc.zatcaKind || (doc.customerVat ? 'STANDARD' : 'SIMPLIFIED'), zatcaStatus: 'PENDING',
        },
      });
      invoiceId = invoice.id;
      await tx.journalEntry.create({
        data: {
          tenantId: req.auth!.tenantId, date: doc.date, descAr: `قيد تلقائي — فاتورة مبيعات — ${doc.customer}`, isAuto: true, sourceRef: `salesDoc:${doc.id}`,
          lines: { create: tag(withCost(salesPosting({ kind: 'SALE', revenueAccount: SYS.sales, net: Number(doc.subtotal), discount: Number(doc.discount), vat: Number(doc.vat), total: Number(doc.total) }), goodsCost, 'SALE'), doc.costCenterId) },
        },
      });
    } else {
      const zatcaQr = buildZatcaTlvBase64({
        sellerName: tenant?.companyName || 'جداره للمحاسبة المالية', vatNumber: tenant?.vatNumber || '',
        timestampIso: new Date().toISOString(), totalWithVat: Number(doc.total), vatAmount: Number(doc.vat),
      });
      const invoice = await tx.invoice.create({
        data: {
          tenantId: req.auth!.tenantId, type: 'CREDIT_NOTE', party: doc.customer, descAr: `مرتجع مبيعات — ${doc.customer}`,
          subtotal: doc.subtotal, vat: doc.vat, total: doc.total, date: doc.date, zatcaQr,
          uuid: randomUUID(), zatcaKind: doc.zatcaKind || (doc.customerVat ? 'STANDARD' : 'SIMPLIFIED'), zatcaStatus: 'PENDING',
        },
      });
      invoiceId = invoice.id;
      await tx.journalEntry.create({
        data: {
          tenantId: req.auth!.tenantId, date: doc.date, descAr: `قيد تلقائي — مرتجع مبيعات — ${doc.customer}`, isAuto: true, sourceRef: `salesDoc:${doc.id}`,
          lines: { create: tag(withCost(salesPosting({ kind: 'RETURN', revenueAccount: SYS.sales, net: Number(doc.subtotal), discount: Number(doc.discount), vat: Number(doc.vat), total: Number(doc.total) }), goodsCost, 'RETURN'), doc.costCenterId) },
        },
      });
    }

    if (doc.discountCode) await tx.saleDiscountCode.updateMany({ where: { tenantId: req.auth!.tenantId, code: doc.discountCode }, data: { usedCount: { increment: 1 } } });
    return tx.salesDoc.update({ where: { id: doc.id }, data: { status: 'CONFIRMED', linkedInvoiceId: invoiceId }, include: { lines: true } });
  });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 400) return res.status(400).json({ error: (error as Error).message });
    throw error;
  }

  if (result.linkedInvoiceId) queueZatcaSubmit(req.auth!.tenantId, result.linkedInvoiceId);
  res.json(result);
});

// POST /api/sales/pos — one-shot point-of-sale flow: creates a CONFIRMED sales
// invoice (stock deducted, Invoice mirrored, journal posted) AND immediately
// records a cash receipt voucher against the given treasury — all in one
// atomic transaction, so a POS sale is always fully paid or not created at all.
router.post('/pos', requireRole('ADMIN', 'ACCOUNTANT'), async (req, res) => {
  const { customer, warehouseId, treasuryId, lines, discountCode, costCenterId } = req.body as { customer: string; warehouseId: string; treasuryId: string; lines: LineInput[]; discountCode?: string; costCenterId?: string };
  if (!customer || !warehouseId || !treasuryId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: 'أكمل بيانات البيع (العميل، المستودع، الخزينة، الأصناف)' });
  }
  const treasury = await prisma.treasury.findFirst({ where: { id: treasuryId, tenantId: req.auth!.tenantId } });
  if (!treasury) return res.status(404).json({ error: 'الخزينة غير موجودة' });

  const priced = await priceLines(req.auth!.tenantId, lines, discountCode);
  if (priced.error) return res.status(400).json({ error: priced.error });
  const tenant = await prisma.tenant.findUnique({ where: { id: req.auth!.tenantId } });

  let centerId: string | null = null;
  try { centerId = await assertCenter(req.auth!.tenantId, costCenterId); }
  catch (error) { return res.status((error as { status?: number }).status || 400).json({ error: (error as Error).message }); }

  const goodsCost = await issueCost(req.auth!.tenantId, lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })));
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    for (const line of lines) await assertOnHand(tx, line.productId, warehouseId, Number(line.quantity));
    const doc = await tx.salesDoc.create({
      data: {
        tenantId: req.auth!.tenantId, type: 'INVOICE', status: 'CONFIRMED', customer, warehouseId, costCenterId: centerId, isPos: true, zatcaKind: 'SIMPLIFIED',
        date: new Date(), ...docMoney(priced),
        lines: { create: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal: l.quantity * l.unitPrice })) },
      },
      include: { lines: true },
    });

    for (const line of doc.lines) {
      await moveStock(tx, req.auth!.tenantId, line.productId, warehouseId, 'OUT', Number(line.quantity), `salesDoc:${doc.id}`);
    }

    const zatcaQr = buildZatcaTlvBase64({
      sellerName: tenant?.companyName || 'جداره للمحاسبة المالية', vatNumber: tenant?.vatNumber || '',
        timestampIso: new Date().toISOString(), totalWithVat: priced.total, vatAmount: priced.vat,
    });
    const invoice = await tx.invoice.create({
      data: {
        tenantId: req.auth!.tenantId, type: 'SALE', party: customer, descAr: `بيع نقطة بيع — ${customer}`,
        subtotal: priced.net, vat: priced.vat, total: priced.total, date: new Date(), zatcaQr,
        uuid: randomUUID(), zatcaKind: 'SIMPLIFIED', zatcaStatus: 'PENDING',
      },
    });
    await tx.salesDoc.update({ where: { id: doc.id }, data: { linkedInvoiceId: invoice.id } });

    // Revenue recognition: Dr Cash/Bank directly (skips the receivable step since POS is paid on the spot)
    await tx.journalEntry.create({
      data: {
        tenantId: req.auth!.tenantId, date: new Date(), descAr: `قيد تلقائي — بيع نقطة بيع — ${customer}`, isAuto: true, sourceRef: `salesDoc:${doc.id}`,
        lines: { create: tag(withCost(salesPosting({ kind: 'SALE', revenueAccount: SYS.posSales, cashAccount: treasury.accountCode, net: priced.net, discount: priced.discount, vat: priced.vat, total: priced.total }), goodsCost, 'SALE'), centerId) },
      },
    });

    if (priced.code) await tx.saleDiscountCode.updateMany({ where: { tenantId: req.auth!.tenantId, code: priced.code }, data: { usedCount: { increment: 1 } } });
    const voucher = await tx.voucher.create({
      data: { tenantId: req.auth!.tenantId, treasuryId, type: 'RECEIPT', party: customer, amount: priced.total, counterAccountCode: SYS.posSales, descAr: `تحصيل نقدي POS — ${customer}`, date: new Date() },
    });

    return { doc: { ...doc, linkedInvoiceId: invoice.id }, invoice, voucher };
  });

  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 400) return res.status(400).json({ error: (error as Error).message });
    throw error;
  }
  queueZatcaSubmit(req.auth!.tenantId, result.invoice.id);
  res.status(201).json(result);
});

export default router;
