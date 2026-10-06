import { SYS } from './seedAccounts';

export function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** خصم بنسبة من مجموع الأصناف، ثم ضريبة 15٪ على الصافي فقط. */
export function applyPercentDiscount(gross: number, percent: number) {
  const base = round2(gross);
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const discount = p > 0 ? round2((base * p) / 100) : 0;
  const net = round2(Math.max(0, base - discount));
  const vat = round2(net * 0.15);
  const total = round2(net + vat);
  return { gross: base, percent: p, discount, net, vat, total };
}

export type PostingLine = { accountCode: string; debit: number; credit: number };

/** قيد البيع: الإيراد بإجمالي الأصناف، والخصم في حساب 4202، والضريبة على الصافي. */
export function salesPosting(opts: {
  kind: 'SALE' | 'RETURN';
  revenueAccount: string;
  cashAccount?: string;
  net: number;
  discount: number;
  vat: number;
  total: number;
}): PostingLine[] {
  const gross = round2(opts.net + opts.discount);
  const discount = round2(opts.discount);
  if (opts.kind === 'RETURN') {
    const lines: PostingLine[] = [
      { accountCode: SYS.salesReturns, debit: gross, credit: 0 },
      { accountCode: SYS.outputVat, debit: opts.vat, credit: 0 },
    ];
    if (discount > 0) lines.push({ accountCode: SYS.salesDiscount, debit: 0, credit: discount });
    lines.push({ accountCode: SYS.receivable, debit: 0, credit: opts.total });
    return lines;
  }
  const lines: PostingLine[] = [
    { accountCode: opts.cashAccount || SYS.receivable, debit: opts.total, credit: 0 },
  ];
  if (discount > 0) lines.push({ accountCode: SYS.salesDiscount, debit: discount, credit: 0 });
  lines.push({ accountCode: opts.revenueAccount, debit: 0, credit: gross });
  lines.push({ accountCode: SYS.outputVat, debit: 0, credit: opts.vat });
  return lines;
}

type DiscountLine = { qty: number; price: number; lineNet: number; vat: number; lineGross: number };

/**
 * يوزّع الخصم على بنود الفاتورة الإلكترونية حتى يبقى مجموع البنود مساوياً للصافي
 * ومجموع ضريبتها مساوياً لضريبة الفاتورة، من غير تغيير شكل ملف الهيئة.
 */
export function prorateDiscountedLines<T extends DiscountLine>(lines: T[], net: number, vatTarget: number): T[] {
  const gross = round2(lines.reduce((s, l) => s + l.lineNet, 0));
  if (gross <= 0 || Math.abs(gross - net) < 0.005) return lines;
  let netUsed = 0;
  let vatUsed = 0;
  return lines.map((l, i) => {
    const last = i === lines.length - 1;
    const lineNet = last ? round2(net - netUsed) : round2((l.lineNet / gross) * net);
    netUsed = round2(netUsed + lineNet);
    const lineVat = last ? round2(vatTarget - vatUsed) : round2(lineNet * 0.15);
    vatUsed = round2(vatUsed + lineVat);
    let qty = l.qty > 0 ? l.qty : 1;
    let price = round2(lineNet / qty);
    if (Math.abs(round2(qty * price) - lineNet) > 0.001) {
      qty = 1;
      price = lineNet;
    }
    return { ...l, qty, price, lineNet, vat: lineVat, lineGross: round2(lineNet + lineVat) };
  });
}
