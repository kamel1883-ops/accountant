import { prisma } from '../config/db';
import { SYS } from './seedAccounts';
import { round2 } from './accounting';

type Move = { productId: string; type: string; quantity: number; createdAt: Date };
type Buy = { productId: string; type: string; quantity: number; cost: number; date: Date; createdAt: Date };
type Sale = { docId: string; productId: string; type: string; quantity: number; createdAt: Date };
type Gl = { date: Date; delta: number };

export type StockBooks = {
  tracked: boolean;
  currentQty: Map<string, number>;
  moves: Move[];
  buys: Buy[];
  sales: Sale[];
  inventoryGl: Gl[];
};

function effect(type: string, quantity: number) {
  if (type === 'OUT') return -quantity;
  if (type === 'TRANSFER') return 0;
  return quantity;
}

export async function loadStockBooks(tenantId: string): Promise<StockBooks> {
  const [balances, moves, lines, sold, gl] = await Promise.all([
    prisma.stockBalance.findMany({ where: { product: { tenantId } }, select: { productId: true, quantity: true } }),
    prisma.stockMovement.findMany({ where: { tenantId }, select: { productId: true, type: true, quantity: true, createdAt: true } }),
    prisma.purchaseDocLine.findMany({
      where: { doc: { tenantId, status: 'CONFIRMED', type: { in: ['INVOICE', 'RETURN'] } } },
      select: { productId: true, quantity: true, lineTotal: true, doc: { select: { type: true, date: true, createdAt: true } } },
    }),
    prisma.salesDocLine.findMany({
      where: { doc: { tenantId, status: 'CONFIRMED', type: { in: ['INVOICE', 'RETURN'] } } },
      select: { productId: true, quantity: true, doc: { select: { id: true, type: true, createdAt: true } } },
    }),
    prisma.journalLine.findMany({
      where: { accountCode: SYS.inventory, entry: { tenantId, kind: { not: 'CLOSING' } } },
      select: { debit: true, credit: true, entry: { select: { date: true } } },
    }),
  ]);
  const currentQty = new Map<string, number>();
  for (const b of balances) currentQty.set(b.productId, (currentQty.get(b.productId) || 0) + Number(b.quantity));
  for (const m of moves) if (!currentQty.has(m.productId)) currentQty.set(m.productId, 0);
  const tracked = [...currentQty.values()].some((q) => Math.abs(q) > 0.0001) || moves.length > 0;
  return {
    tracked,
    currentQty,
    moves: moves.map((m) => ({ productId: m.productId, type: m.type, quantity: Number(m.quantity), createdAt: m.createdAt })),
    buys: lines.map((l) => ({ productId: l.productId, type: l.doc.type, quantity: Number(l.quantity), cost: Number(l.lineTotal), date: l.doc.date, createdAt: l.doc.createdAt })),
    sales: sold.map((l) => ({ docId: l.doc.id, productId: l.productId, type: l.doc.type, quantity: Number(l.quantity), createdAt: l.doc.createdAt })),
    inventoryGl: gl.map((l) => ({ date: l.entry.date, delta: Number(l.debit) - Number(l.credit) })),
  };
}

/** متوسط تكلفة الوحدات الباقية وقت البيع، لا متوسط كل المشتريات منذ البداية. */
function unitCost(books: StockBooks, productId: string, asOf: Date, excludeDocId?: string) {
  const events: { t: number; kind: 'in' | 'out' | 'back'; qty: number; cost: number }[] = [];
  for (const b of books.buys) {
    if (b.productId !== productId) continue;
    if (b.createdAt > asOf && b.date > asOf) continue;
    const sign = b.type === 'RETURN' ? -1 : 1;
    events.push({ t: b.createdAt.getTime(), kind: 'in', qty: sign * b.quantity, cost: sign * b.cost });
  }
  for (const s of books.sales || []) {
    if (s.productId !== productId || s.docId === excludeDocId || s.createdAt > asOf) continue;
    events.push({ t: s.createdAt.getTime(), kind: s.type === 'RETURN' ? 'back' : 'out', qty: s.quantity, cost: 0 });
  }
  events.sort((a, b) => a.t - b.t || (a.kind === 'in' ? -1 : 1));
  let qty = 0;
  let value = 0;
  for (const e of events) {
    if (e.kind === 'in') {
      qty += e.qty;
      value += e.cost;
      if (qty <= 0.0001) { qty = 0; value = 0; }
    } else if (e.kind === 'out') {
      if (qty <= 0.0001) continue;
      const take = Math.min(e.qty, qty);
      value -= take * (value / qty);
      qty -= take;
    } else {
      const avg = qty > 0.0001 ? value / qty : 0;
      qty += e.qty;
      value += e.qty * avg;
    }
  }
  if (qty > 0.0001) return value / qty;
  return 0;
}

export function physicalAt(books: StockBooks, asOf: Date) {
  if (!books.tracked) return 0;
  let value = 0;
  for (const [productId, now] of books.currentQty) {
    let qty = now;
    for (const m of books.moves) {
      if (m.productId === productId && m.createdAt > asOf) qty -= effect(m.type, m.quantity);
    }
    value += qty * unitCost(books, productId, asOf);
  }
  return round2(value);
}

export function postedInventoryAt(books: StockBooks, asOf: Date) {
  let total = 0;
  for (const line of books.inventoryGl) if (line.date <= asOf) total += line.delta;
  return round2(total);
}

export function bridgeBetween(books: StockBooks, from: Date, to: Date) {
  const openingCut = new Date(from.getTime() - 1);
  const physicalOpening = books.tracked ? physicalAt(books, openingCut) : postedInventoryAt(books, openingCut);
  const physicalClosing = books.tracked ? physicalAt(books, to) : postedInventoryAt(books, to);
  const postedOpening = postedInventoryAt(books, openingCut);
  const postedClosing = postedInventoryAt(books, to);
  const openingGap = round2(physicalOpening - postedOpening);
  const closingGap = round2(physicalClosing - postedClosing);
  return {
    tracked: books.tracked,
    physicalOpening, physicalClosing, postedOpening, postedClosing,
    openingGap, closingGap,
    periodAdjustment: round2(closingGap - openingGap),
  };
}

export async function merchandiseBridge(tenantId: string, from: Date, to: Date) {
  return bridgeBetween(await loadStockBooks(tenantId), from, to);
}

export async function merchandiseAt(tenantId: string, asOf: Date) {
  const books = await loadStockBooks(tenantId);
  const posted = postedInventoryAt(books, asOf);
  const physical = books.tracked ? physicalAt(books, asOf) : posted;
  return { physical, posted, gap: round2(physical - posted), tracked: books.tracked };
}

/** تكلفة إخراج البضاعة: متوسط سعر الشراء الفعلي. بلا فاتورة مشتريات لا تُحتسب تكلفة. */
export async function issueCost(tenantId: string, lines: { productId: string; quantity: number }[], asOf = new Date(), excludeDocId?: string) {
  const books = await loadStockBooks(tenantId);
  return round2(lines.reduce((sum, line) => sum + Number(line.quantity) * unitCost(books, line.productId, asOf, excludeDocId), 0));
}
