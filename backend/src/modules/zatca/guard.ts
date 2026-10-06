import { prisma } from '../../config/db';
import { redactZatcaText } from './redact';
import { loadZatcaDevice } from './secrets';
import { submitExistingInvoice } from './submit';

const RIYADH_MS = 3 * 60 * 60 * 1000;
const STALE_MS = 30 * 60 * 1000;
const MAX_PER_TENANT = 200;
const ATTEMPTS = 2;

let running = false;

/** سبب قصير للمحاسب، بلا جسم الفاتورة ولا أسرار الربط. */
export function failureReason(raw: string | null | undefined) {
  const text = redactZatcaText(raw || '', 800).trim();
  if (!text) return 'لم تصل إلى هيئة الزكاة والدخل';
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const data = JSON.parse(text);
      const bag = data?.validationResults?.errorMessages || data?.errors;
      if (Array.isArray(bag) && bag.length) {
        const msg = bag.map((e: any) => (typeof e === 'string' ? e : e?.message || e?.code || '')).filter(Boolean).join(' — ');
        if (msg) return String(msg).slice(0, 280);
      }
      if (typeof data?.message === 'string' && data.message.trim()) return data.message.trim().slice(0, 280);
    } catch { /* النص كما هو */ }
  }
  return text.replace(/\s+/g, ' ').slice(0, 280);
}

export function quarterBounds(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3;
  const from = new Date(Date.UTC(year, startMonth, 1) - RIYADH_MS);
  const to = new Date(Date.UTC(year, startMonth + 3, 1) - RIYADH_MS);
  return { from, to };
}

/** فواتير البيع والإشعار الدائن التي لا يوجد لها إرسال ناجح في الربع. */
export async function unsentReport(tenantId: string, year: number, quarter: number) {
  const { from, to } = quarterBounds(year, quarter);
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      type: { in: ['SALE', 'CREDIT_NOTE'] },
      date: { gte: from, lt: to },
      NOT: { zatcaStatus: { in: ['CLEARED', 'REPORTED'] } },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
  });
  const ids = invoices.map((i) => i.id);
  const okRows = ids.length
    ? await prisma.zatcaSubmission.findMany({
      where: { tenantId, status: 'OK', invoiceId: { in: ids } },
      select: { invoiceId: true },
    })
    : [];
  const reached = new Set(okRows.map((r) => r.invoiceId));
  const stuck = invoices.filter((i) => !reached.has(i.id));
  const stuckIds = stuck.map((i) => i.id);
  const [docs, fails, latest] = stuckIds.length
    ? await Promise.all([
      prisma.salesDoc.findMany({
        where: { tenantId, linkedInvoiceId: { in: stuckIds } },
        select: { id: true, linkedInvoiceId: true, isPos: true },
      }),
      prisma.zatcaSubmission.groupBy({
        by: ['invoiceId'],
        where: { tenantId, status: 'FAILED', invoiceId: { in: stuckIds } },
        _count: { _all: true },
      }),
      prisma.zatcaSubmission.findMany({
        where: { tenantId, invoiceId: { in: stuckIds }, kind: { in: ['CLEARANCE', 'REPORTING'] } },
        orderBy: { createdAt: 'desc' },
        select: { invoiceId: true, kind: true },
      }),
    ])
    : [[], [], []];
  const docOf = new Map(docs.map((d) => [d.linkedInvoiceId, d]));
  const attemptsOf = new Map(fails.map((f) => [f.invoiceId, f._count._all]));
  const kindOf = new Map<string, string>();
  for (const row of latest) {
    if (row.invoiceId && !kindOf.has(row.invoiceId)) kindOf.set(row.invoiceId, row.kind);
  }
  const rows = stuck.map((inv) => {
    const doc = docOf.get(inv.id);
    const kind = kindOf.get(inv.id) || (String(inv.zatcaKind || '').toUpperCase() === 'STANDARD' ? 'CLEARANCE' : inv.zatcaKind ? 'REPORTING' : '');
    return {
      invoiceId: inv.id,
      number: (doc?.id || inv.id).slice(0, 8).toUpperCase(),
      reference: inv.uuid || '',
      party: inv.party,
      date: inv.date,
      total: Number(inv.total),
      kind,
      channel: doc?.isPos ? 'POS' : 'SALES',
      docType: inv.type,
      attempts: attemptsOf.get(inv.id) || 0,
      reason: failureReason(inv.zatcaMessage),
    };
  });
  const total = rows.reduce((s, r) => s + r.total, 0);
  return { year, quarter, count: rows.length, total: Math.round(total * 100) / 100, rows };
}

async function retryOneTenant(tenantId: string) {
  const device = await loadZatcaDevice(tenantId);
  if (!device || device.status !== 'ACTIVE' || !device.pcsidToken || !device.pcsidSecret) {
    return { retried: 0, ok: 0, failed: 0, skipped: 0 };
  }
  const cutoff = new Date(Date.now() - STALE_MS);
  const invoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      type: { in: ['SALE', 'CREDIT_NOTE'] },
      createdAt: { lt: cutoff },
      NOT: { zatcaStatus: { in: ['CLEARED', 'REPORTED'] } },
    },
    orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    take: MAX_PER_TENANT + 40,
    select: { id: true },
  });
  const ids = invoices.map((i) => i.id);
  const okRows = ids.length
    ? await prisma.zatcaSubmission.findMany({
      where: { tenantId, status: 'OK', invoiceId: { in: ids } },
      select: { invoiceId: true },
    })
    : [];
  const reached = new Set(okRows.map((r) => r.invoiceId));
  const todo = invoices.filter((i) => !reached.has(i.id)).slice(0, MAX_PER_TENANT);
  let retried = 0;
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const inv of todo) {
    let sent = false;
    for (let n = 0; n < ATTEMPTS && !sent; n++) {
      retried += 1;
      try {
        const out = await submitExistingInvoice(tenantId, inv.id);
        if (out.ok) { ok += 1; sent = true; }
        else if (out.skipped) { skipped += 1; sent = true; }
        else if (n === ATTEMPTS - 1) failed += 1;
      } catch (e: any) {
        failed += 1;
        console.error('zatca nightly', inv.id.slice(0, 8), String(e?.message || e).slice(0, 160));
      }
    }
  }
  return { retried, ok, failed, skipped };
}

/** يعيد إرسال فواتير البيع التي لم تصل، الأقدم أولاً، دون المساس بما وصل. */
export async function retryFailedInvoices() {
  if (running) return;
  running = true;
  try {
    const devices = await prisma.zatcaDevice.findMany({
      where: { status: 'ACTIVE' },
      select: { tenantId: true },
    });
    let retried = 0;
    let ok = 0;
    let failed = 0;
    let skipped = 0;
    for (const d of devices) {
      const r = await retryOneTenant(d.tenantId);
      retried += r.retried;
      ok += r.ok;
      failed += r.failed;
      skipped += r.skipped;
    }
    console.log(`zatca nightly retry tenants=${devices.length} retried=${retried} ok=${ok} failed=${failed} skipped=${skipped}`);
  } finally {
    running = false;
  }
}

export function msUntilNextRiyadhMidnight(now = Date.now()) {
  const day = 24 * 60 * 60 * 1000;
  const intoDay = (now + RIYADH_MS) % day;
  return intoDay === 0 ? day : day - intoDay;
}

export function startZatcaNightlyRetry() {
  const riyadhHour = new Date(Date.now() + RIYADH_MS).getUTCHours();
  if (riyadhHour < 6) setTimeout(() => { void retryFailedInvoices(); }, 20_000);
  console.log(`zatca nightly armed in ${Math.round(msUntilNextRiyadhMidnight() / 60000)} min`);
  const arm = () => {
    setTimeout(() => {
      void retryFailedInvoices();
      arm();
    }, msUntilNextRiyadhMidnight());
  };
  arm();
}
