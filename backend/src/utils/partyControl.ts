export function round2(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export type ControlRow = {
  id: string;
  party: string | null;
  kind: 'INVOICE' | 'RETURN' | 'SETTLEMENT' | 'OTHER';
  effect: number;
  date: string;
  description?: string;
  reference?: string;
};

export type Apply = { sourceId: string; targetId: string; amount: number };

/** مجموع الأطراف + الحركات بلا طرف = رصيد حساب الأستاذ. التطبيق لا يغيّر الصافي. */
export function partyControl(rows: ControlRow[], applications: Apply[] = []) {
  const appliedTo = new Map<string, number>();
  const appliedFrom = new Map<string, number>();
  for (const a of applications) {
    appliedTo.set(a.targetId, round2((appliedTo.get(a.targetId) || 0) + Number(a.amount)));
    appliedFrom.set(a.sourceId, round2((appliedFrom.get(a.sourceId) || 0) + Number(a.amount)));
  }
  const groups = new Map<string, ControlRow[]>();
  for (const row of rows) {
    const key = String(row.party || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const parties = [...groups.entries()].map(([key, list]) => {
    const net = round2(list.reduce((s, r) => s + Number(r.effect), 0));
    const openInvoices = list.filter((r) => r.kind === 'INVOICE' && r.effect > 0).map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description || '',
      reference: r.reference || '',
      amount: round2(r.effect),
      remaining: round2(r.effect - (appliedTo.get(r.id) || 0)),
    }));
    const settlements = list.filter((r) => r.kind === 'SETTLEMENT').map((r) => ({
      id: r.id,
      date: r.date,
      description: r.description || '',
      amount: round2(Math.abs(r.effect)),
      unapplied: round2(Math.abs(r.effect) - (appliedFrom.get(r.id) || 0)),
    }));
    return { party: key || null, name: key || 'حركات بلا طرف', net, openInvoices, settlements };
  });
  const gl = round2(rows.reduce((s, r) => s + Number(r.effect), 0));
  const subledger = round2(parties.filter((p) => p.party).reduce((s, p) => s + p.net, 0));
  const unassigned = round2(parties.filter((p) => !p.party).reduce((s, p) => s + p.net, 0));
  return { parties, gl, subledger, unassigned, tied: Math.abs(round2(gl - subledger - unassigned)) < 0.02 };
}

export function canApply(rows: ControlRow[], applications: Apply[], sourceId: string, targetId: string, amount: number) {
  const source = rows.find((r) => r.id === sourceId);
  const target = rows.find((r) => r.id === targetId);
  if (!source || !target || !source.party || source.party !== target.party) return false;
  if (source.kind !== 'SETTLEMENT' || target.kind !== 'INVOICE') return false;
  if (!(amount > 0)) return false;
  const view = partyControl(rows, applications);
  const party = view.parties.find((p) => p.party === source.party);
  const invoice = party?.openInvoices.find((i) => i.id === targetId);
  const settlement = party?.settlements.find((s) => s.id === sourceId);
  return !!invoice && !!settlement && amount <= invoice.remaining + 0.001 && amount <= settlement.unapplied + 0.001;
}

export function vatTieOut(input: { outputGl: number; inputGl: number; salesVat: number; purchaseVat: number }) {
  const outputDiff = round2(Number(input.outputGl) - Number(input.salesVat));
  const inputDiff = round2(Number(input.inputGl) - Number(input.purchaseVat));
  return {
    outputGl: round2(Number(input.outputGl)),
    inputGl: round2(Number(input.inputGl)),
    salesVat: round2(Number(input.salesVat)),
    purchaseVat: round2(Number(input.purchaseVat)),
    outputDiff,
    inputDiff,
    net: round2(Number(input.outputGl) - Number(input.inputGl)),
    tied: Math.abs(outputDiff) < 0.02 && Math.abs(inputDiff) < 0.02,
  };
}

/** فرق التقييم يظهر كقيد مقترح للمراجعة، ولا يُرحَّل من المطابقة. */
export function inventoryTieOut(valuation: number, gl: number) {
  const difference = round2(Number(valuation) - Number(gl));
  if (Math.abs(difference) < 0.02) return { valuation: round2(valuation), gl: round2(gl), difference: 0, suggestion: null };
  const amount = round2(Math.abs(difference));
  const suggestion = difference > 0
    ? { debitAccount: '1105', creditAccount: '5302', amount, reason: 'قيمة المخزون أعلى من الأستاذ — للمراجعة فقط', posted: false }
    : { debitAccount: '5302', creditAccount: '1105', amount, reason: 'رصيد المخزون في الأستاذ أعلى من التقييم — للمراجعة فقط', posted: false };
  return { valuation: round2(valuation), gl: round2(gl), difference, suggestion };
}
