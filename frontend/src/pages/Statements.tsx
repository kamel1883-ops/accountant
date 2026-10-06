import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { PeriodBar, PrintHeader, Line, Items, money, gdate, startOfYear, today } from '../components/fin';
import { useI18n } from '../i18n';

const TAB_KEYS = ['income', 'balance', 'cash', 'equity'] as const;
type Tab = (typeof TAB_KEYS)[number];

const emptyList = { total: 0, items: [] as any[] };
const emptyMove = { opening: 0, change: 0, closing: 0 };

function bucket(v: any) {
  if (!v || typeof v !== 'object') return emptyList;
  return { total: Number(v.total) || 0, items: Array.isArray(v.items) ? v.items : [] };
}
function move(v: any) {
  if (!v || typeof v !== 'object') return emptyMove;
  return { opening: Number(v.opening) || 0, change: Number(v.change) || 0, closing: Number(v.closing) || 0 };
}

export default function Statements() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('income');
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setLoading(true);
    setErr('');
    setD(null);
    const fn: Record<Tab, () => Promise<any>> = {
      income: () => api.getIncomeStatement(from, to),
      balance: () => api.getBalanceSheet(to),
      cash: () => api.getCashFlow(from, to),
      equity: () => api.getEquityStatement(from, to),
    };
    try {
      setD(await fn[tab]());
    } catch (e: any) {
      setErr(e?.message || t('journal.loadFail'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { void load(); }, [tab]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('st.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('st.sub')}</p>
      <div className="flex gap-2 flex-wrap mb-4 print:hidden">
        {TAB_KEYS.map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`text-sm px-4 py-1.5 rounded-lg ${tab === k ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t(`st.${k}`)}</button>
        ))}
      </div>
      <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} asOfOnly={tab === 'balance'} />
      {loading && <p className="text-sm text-[#6C6A82]">{t('loading')}</p>}
      {!loading && err && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{err}</p>}
      {!loading && !err && d && (
        <Card>
          <PrintHeader title={t(`st.${tab}`)} period={tab === 'balance' ? `${t('st.asOf')} ${gdate(d.asOf)}` : `${t('st.forPeriod')} ${gdate(d.from)} ${t('to')} ${gdate(d.to)}`} />
          {tab === 'income' && <Income d={d} />}
          {tab === 'balance' && <Balance d={d} />}
          {tab === 'cash' && <Cash d={d} />}
          {tab === 'equity' && <Equity d={d} />}
        </Card>
      )}
    </div>
  );
}

const Head = ({ title, sub }: any) => <div className="mb-3 print:hidden"><h3 className="font-bold">{title}</h3><p className="text-xs text-[#6C6A82]">{sub}</p></div>;
function usePer() { const { t } = useI18n(); return (row: any) => `${t('st.forPeriod')} ${gdate(row?.from)} ${t('to')} ${gdate(row?.to)}`; }

function Income({ d }: any) {
  const { t } = useI18n(); const per = usePer();
  const sales = bucket(d.sales);
  const salesReturns = bucket(d.salesReturns);
  const cogs = bucket(d.cogs);
  const opex = bucket(d.operatingExpenses);
  const otherIncome = bucket(d.otherIncome);
  const otherExpense = bucket(d.otherExpense);
  const netProfit = Number(d.netProfit) || 0;
  const gross = Number(d.grossProfit) || 0;
  const openingInventory = Number(d.cogs?.openingInventory) || 0;
  const closingInventory = Number(d.cogs?.closingInventory) || 0;
  const purchases = Number(d.cogs?.purchases) || 0;
  const purchaseReturns = Number(d.cogs?.purchaseReturns) || 0;
  return (
    <>
      <Head title={t('st.income')} sub={per(d)} />
      <Line label={t('st.sales')} value={sales.total} bold /><Items items={sales.items} />
      {salesReturns.total > 0 && <Line label={t('st.salesReturns')} value={-salesReturns.total} />}
      <Line label={t('st.netSales')} value={Number(d.netSales) || 0} bold top />
      {openingInventory !== 0 && <Line label={t('st.openingInventory')} value={openingInventory} indent />}
      <Line label={t('st.purchases')} value={purchases} indent /><Items items={cogs.items} />
      {purchaseReturns !== 0 && <Line label={t('st.purchaseReturns')} value={-purchaseReturns} indent />}
      {closingInventory !== 0 && <Line label={t('st.closingInventory')} value={-closingInventory} indent />}
      <Line label={t('st.cogs')} value={-cogs.total} bold top />
      <Line label={gross >= 0 ? t('st.grossProfit') : t('st.grossLoss')} value={gross} bold top big />
      <Line label={t('st.opex')} value={-opex.total} bold /><Items items={opex.items} />
      <Line label={t('st.operatingProfit')} value={Number(d.operatingProfit) || 0} bold top />
      {otherIncome.total > 0 && <><Line label={t('st.otherIncome')} value={otherIncome.total} /><Items items={otherIncome.items} /></>}
      {otherExpense.total > 0 && <><Line label={t('st.otherExpense')} value={-otherExpense.total} /><Items items={otherExpense.items} /></>}
      <div className="flex justify-between py-3 px-3 mt-2 bg-navy text-white rounded-lg font-bold">
        <span>{netProfit >= 0 ? t('st.netProfit') : t('st.netLoss')}</span><span dir="ltr" className="font-mono text-lg">{money(Math.abs(netProfit))}</span>
      </div>
      <p className="text-xs text-[#6C6A82] mt-2">{t('st.margin')}: {Number(d.margin) || 0}%</p>
    </>
  );
}

function Balance({ d }: any) {
  const { t } = useI18n();
  const assets = d?.assets && typeof d.assets === 'object' ? d.assets : {};
  const liab = d?.liabilities && typeof d.liabilities === 'object' ? d.liabilities : {};
  const equity = d?.equity && typeof d.equity === 'object' ? d.equity : {};
  const curA = bucket(assets.current);
  const ncurA = bucket(assets.nonCurrent);
  const curL = bucket(liab.current);
  const ncurL = bucket(liab.nonCurrent);
  const posted = bucket(equity.posted);
  return (
    <>
      <Head title={t('st.balance')} sub={`${t('st.asOf')} ${gdate(d.asOf)}`} />
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <h4 className="font-bold mb-2 bg-goldsoft rounded px-2 py-1 text-sm">{t('st.assets')}</h4>
          <Line label={t('st.currentAssets')} value={curA.total} bold /><Items items={curA.items} />
          <Line label={t('st.nonCurrentAssets')} value={ncurA.total} bold /><Items items={ncurA.items} />
          <Line label={t('st.totalAssets')} value={Number(assets.total) || 0} bold top big />
        </div>
        <div>
          <h4 className="font-bold mb-2 bg-goldsoft rounded px-2 py-1 text-sm">{t('st.liabEquity')}</h4>
          <Line label={t('st.currentLiab')} value={curL.total} bold /><Items items={curL.items} />
          <Line label={t('st.nonCurrentLiab')} value={ncurL.total} bold /><Items items={ncurL.items} />
          <Line label={t('st.totalLiab')} value={Number(liab.total) || 0} bold top />
          <Line label={t('st.equitySection')} value={posted.total} bold /><Items items={posted.items} />
          <Line label={t('st.periodResult')} value={Number(equity.currentPeriodResult) || 0} indent />
          <Line label={t('st.totalEquity')} value={Number(equity.total) || 0} bold />
          <Line label={t('st.totalLiabEquity')} value={Number(d.totalLiabilitiesAndEquity) || 0} bold top big />
        </div>
      </div>
      <p className={`mt-4 text-sm font-bold ${d.balanced ? 'text-green-700' : 'text-red-600'}`}>
        {d.balanced ? t('st.bsBalanced') : `${t('st.bsNotBalanced')} ${money(d.difference)}`}
      </p>
    </>
  );
}

function Cash({ d }: any) {
  const { t } = useI18n(); const per = usePer();
  const op = d?.operating && typeof d.operating === 'object' ? d.operating : {};
  const inv = bucket(d?.investing);
  const fin = bucket(d?.financing);
  return (
    <>
      <Head title={t('st.cash')} sub={per(d)} />
      <h4 className="font-bold mt-2 mb-1 text-sm bg-goldsoft rounded px-2 py-1">{t('st.operating')}</h4>
      <Line label={t('st.netProfit')} value={Number(op.netProfit) || 0} />
      <Line label={t('st.addDep')} value={Number(op.depreciation) || 0} indent />
      {Number(op.inventoryChange) !== 0 && <Line label={t('st.inventoryChange')} value={Number(op.inventoryChange) || 0} indent />}
      <Line label={t('st.wcAssets')} value={Number(op.workingCapitalAssets) || 0} indent />
      <Line label={t('st.wcLiab')} value={Number(op.workingCapitalLiabilities) || 0} indent />
      <Line label={t('st.netOperating')} value={Number(op.total) || 0} bold top />
      <h4 className="font-bold mt-3 mb-1 text-sm bg-goldsoft rounded px-2 py-1">{t('st.investing')}</h4>
      <Items items={inv.items} /><Line label={t('st.netInvesting')} value={inv.total} bold />
      <h4 className="font-bold mt-3 mb-1 text-sm bg-goldsoft rounded px-2 py-1">{t('st.financing')}</h4>
      <Items items={fin.items} /><Line label={t('st.netFinancing')} value={fin.total} bold />
      <Line label={t('st.netChange')} value={Number(d.netChange) || 0} bold top big />
      <Line label={t('st.openingCash')} value={Number(d.openingCash) || 0} />
      <Line label={t('st.closingCash')} value={Number(d.closingCash) || 0} bold />
      <Items items={Array.isArray(d.cashAccounts) ? d.cashAccounts : []} />
      <p className={`mt-3 text-sm font-bold ${d.reconciled ? 'text-green-700' : 'text-red-600'}`}>
        {d.reconciled ? t('st.reconciled') : `${t('st.notReconciled')}: ${money((Number(d.netChange) || 0) - (Number(d.actualChange) || 0))}`}
      </p>
    </>
  );
}

function Equity({ d }: any) {
  const { t } = useI18n(); const per = usePer();
  const R = ({ label, m }: any) => <tr className="border-t border-[#E7E5DE]"><td className="py-2">{label}</td><td dir="ltr" className="font-mono">{money(m.opening)}</td><td dir="ltr" className="font-mono">{money(m.change)}</td><td dir="ltr" className="font-mono font-bold">{money(m.closing)}</td></tr>;
  const drawings = move(d.drawings);
  const profit = Number(d.profitForPeriod) || 0;
  return (
    <>
      <Head title={t('st.equity')} sub={per(d)} />
      <table className="w-full text-sm">
        <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('st.item')}</th><th className="text-start">{t('trial.opening')}</th><th className="text-start">{t('st.movementCol')}</th><th className="text-start">{t('trial.closing')}</th></tr></thead>
        <tbody>
          <R label={t('st.capital')} m={move(d.capital)} /><R label={t('st.reserves')} m={move(d.reserves)} /><R label={t('st.retained')} m={move(d.retainedEarnings)} />
          <tr className="border-t border-[#E7E5DE]"><td className="py-2">{t('st.drawings')}</td><td dir="ltr" className="font-mono">({money(drawings.opening)})</td><td dir="ltr" className="font-mono">({money(drawings.change)})</td><td dir="ltr" className="font-mono font-bold">({money(drawings.closing)})</td></tr>
          <tr className="border-t border-[#E7E5DE]"><td className="py-2">{t('st.profitPeriod')}</td><td>—</td><td dir="ltr" className="font-mono">{money(profit)}</td><td dir="ltr" className="font-mono font-bold">{money(profit)}</td></tr>
        </tbody>
        <tfoot><tr className="border-t-2 border-navy font-bold"><td className="py-2">{t('st.totalEquity')}</td><td dir="ltr" className="font-mono">{money(d.openingTotal)}</td><td>—</td><td dir="ltr" className="font-mono">{money(d.closingTotal)}</td></tr></tfoot>
      </table>
    </>
  );
}
