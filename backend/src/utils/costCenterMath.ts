export function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type SplitPart = { costCenterId: string; percentage: number };

/** يوزّع مبلغاً بالنسب بحيث يساوي المجموع المبلغ الأصلي بلا فرق تقريب. */
export function splitAmounts(total: number, parts: SplitPart[]) {
  const sum = round2(parts.reduce((s, p) => s + Number(p.percentage), 0));
  if (Math.abs(sum - 100) > 0.02) {
    const error = new Error('مجموع نسب التوزيع يجب أن يساوي 100٪') as Error & { status?: number };
    error.status = 400;
    throw error;
  }
  let used = 0;
  return parts.map((p, i) => {
    const last = i === parts.length - 1;
    const amount = last ? round2(total - used) : round2((Number(total) * Number(p.percentage)) / 100);
    used = round2(used + amount);
    return { costCenterId: p.costCenterId, percentage: Number(p.percentage), amount };
  });
}

export function tag<T extends object>(lines: T[], costCenterId?: string | null): (T & { costCenterId?: string })[] {
  if (!costCenterId) return lines;
  return lines.map((l) => ({ ...l, costCenterId }));
}

export type IncomeLine = {
  centerId?: string | null;
  accountCode?: string;
  subtype?: string | null;
  debit: number;
  credit: number;
};

export function incomeRows(lines: IncomeLine[]) {
  const map = new Map<string, { centerId: string | null; sales: number; returns: number; discounts: number; cogs: number; expenses: number }>();
  const bucket = (id: string) => {
    if (!map.has(id)) map.set(id, { centerId: id || null, sales: 0, returns: 0, discounts: 0, cogs: 0, expenses: 0 });
    return map.get(id)!;
  };
  for (const l of lines) {
    const b = bucket(l.centerId || '');
    const credit = Number(l.credit) || 0;
    const debit = Number(l.debit) || 0;
    if (l.accountCode === '4202') b.discounts = round2(b.discounts + debit - credit);
    else if (l.subtype === 'SALES_RETURNS') b.returns = round2(b.returns + debit - credit);
    else if (l.subtype === 'SALES_REVENUE' || l.subtype === 'OTHER_INCOME') b.sales = round2(b.sales + credit - debit);
    else if (l.subtype === 'PURCHASE_RETURNS') b.cogs = round2(b.cogs - (credit - debit));
    else if (l.subtype === 'PURCHASES_COST') b.cogs = round2(b.cogs + debit - credit);
    else if (l.subtype === 'OPERATING_EXPENSE' || l.subtype === 'DEPRECIATION' || l.subtype === 'OTHER_EXPENSE') {
      b.expenses = round2(b.expenses + debit - credit);
    }
  }
  return [...map.values()].map((b) => {
    const netSales = round2(b.sales - b.returns - b.discounts);
    const gross = round2(netSales - b.cogs);
    const profit = round2(gross - b.expenses);
    const margin = netSales ? round2((profit / netSales) * 100) : 0;
    return { ...b, netSales, gross, profit, margin };
  });
}
