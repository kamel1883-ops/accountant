import { prisma } from '../config/db';
import { issueCost } from './inventoryValue';
import { ensureStandardAccounts, SYS } from './seedAccounts';

/** نهاية يوم المستند بالتوقيت العالمي حتى تُحتسب مشتريات نفس اليوم. */
export function endOfUtcDay(d: Date) {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

/**
 * الجرد المستمر لكل المنشآت:
 * فاتورة المشتريات التلقائية تُرحَّل إلى المخزون لا إلى مصروف المشتريات،
 * وفاتورة البيع التي بلا تكلفة تُكمَّل بقيد تكلفة الوحدات المباعة.
 * التشغيل مرة ثانية يصحّح تكلفة البيع إن تغيّر متوسط الوحدات الباقية، ولا يكرر القيد.
 */
export async function alignPerpetualInventory(tenantId: string) {
  await ensureStandardAccounts(tenantId);

  const purchaseLines = await prisma.journalLine.findMany({
    where: {
      accountCode: { in: [SYS.purchases, SYS.purchaseReturns] },
      entry: { tenantId, isAuto: true, sourceRef: { startsWith: 'purchaseDoc:' } },
    },
    select: { id: true },
  });
  if (purchaseLines.length) {
    await prisma.journalLine.updateMany({
      where: { id: { in: purchaseLines.map((l) => l.id) } },
      data: { accountCode: SYS.inventory },
    });
  }

  const sales = await prisma.salesDoc.findMany({
    where: { tenantId, status: 'CONFIRMED', type: { in: ['INVOICE', 'RETURN'] } },
    include: { lines: true },
    orderBy: { date: 'asc' },
  });
  let cogs = 0;
  for (const doc of sales) {
    const entry = await prisma.journalEntry.findFirst({
      where: { tenantId, isAuto: true, sourceRef: `salesDoc:${doc.id}` },
      include: { lines: true },
    });
    if (!entry) continue;
    const cost = await issueCost(
      tenantId,
      doc.lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
      entry.createdAt,
      doc.id,
    );
    const cogsLine = entry.lines.find((l) => l.accountCode === SYS.cogs);
    const stockLine = entry.lines.find((l) => l.accountCode === SYS.inventory);
    const posted = cogsLine
      ? (doc.type === 'RETURN' ? Number(cogsLine.credit) : Number(cogsLine.debit))
      : 0;
    if (!(cost > 0) || Math.abs(posted - cost) <= 0.02) continue;
    if (cogsLine && stockLine) {
      if (doc.type === 'RETURN') {
        await prisma.journalLine.update({ where: { id: cogsLine.id }, data: { debit: 0, credit: cost, costCenterId: doc.costCenterId } });
        await prisma.journalLine.update({ where: { id: stockLine.id }, data: { debit: cost, credit: 0, costCenterId: doc.costCenterId } });
      } else {
        await prisma.journalLine.update({ where: { id: cogsLine.id }, data: { debit: cost, credit: 0, costCenterId: doc.costCenterId } });
        await prisma.journalLine.update({ where: { id: stockLine.id }, data: { debit: 0, credit: cost, costCenterId: doc.costCenterId } });
      }
    } else if (!cogsLine) {
      const lines = doc.type === 'RETURN'
        ? [
            { accountCode: SYS.inventory, debit: cost, credit: 0, descAr: 'إرجاع المخزون بالتكلفة', costCenterId: doc.costCenterId },
            { accountCode: SYS.cogs, debit: 0, credit: cost, descAr: 'عكس تكلفة المبيعات', costCenterId: doc.costCenterId },
          ]
        : [
            { accountCode: SYS.cogs, debit: cost, credit: 0, descAr: 'تكلفة البضاعة المباعة', costCenterId: doc.costCenterId },
            { accountCode: SYS.inventory, debit: 0, credit: cost, descAr: 'إخراج المخزون بالتكلفة', costCenterId: doc.costCenterId },
          ];
      await prisma.journalLine.createMany({ data: lines.map((l) => ({ ...l, entryId: entry.id })) });
    }
    cogs += 1;
  }
  return { moved: purchaseLines.length, cogs };
}

export async function alignAllTenants() {
  const tenants = await prisma.tenant.findMany({ select: { id: true, companyName: true } });
  for (const tenant of tenants) {
    const result = await alignPerpetualInventory(tenant.id);
    if (result.moved || result.cogs) console.log(`جرد مستمر ${tenant.companyName}: نقل ${result.moved}، تكلفة ${result.cogs}`);
  }
}
