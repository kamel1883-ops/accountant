import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, Kpi } from '../components/Layout';
import { ExcelButton, PrintHeader, money, gdate } from '../components/fin';
import { localizeNote, useI18n } from '../i18n';

export default function Reports() {
  const { t } = useI18n();
  const [tab, setTab] = useState('sales');
  const tabs = [
    { key: 'sales', label: t('nav.sales') },
    { key: 'purchases', label: t('nav.purchases') },
    { key: 'inventory', label: t('nav.products') },
    { key: 'expenses', label: t('st.opex') },
    { key: 'ledger', label: t('rep.ledger') },
  ];
  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('nav.reports')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('rep.sub')}</p>
      <div className="flex gap-2 mb-5 flex-wrap print:hidden">
        {tabs.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)} className={`text-sm px-4 py-1.5 rounded-lg ${tab === x.key ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{x.label}</button>
        ))}
      </div>
      {tab === 'sales' && <PartyReport title={t('rep.sales')} partyLabel={t('customer')} fetcher={api.getSalesReport} keyName="byCustomer" />}
      {tab === 'purchases' && <PartyReport title={t('rep.purchases')} partyLabel={t('supplier')} fetcher={api.getPurchasesReport} keyName="bySupplier" />}
      {tab === 'inventory' && <InventoryReport />}
      {tab === 'expenses' && <ExpensesReport />}
      {tab === 'ledger' && <LedgerReport />}
    </div>
  );
}

function PrintBar({ title, period }: { title: string; period?: string }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex justify-end gap-2 mb-3 print:hidden">
        <button type="button" onClick={() => window.print()} className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold">🖨 {t('print')}</button>
        <ExcelButton title={title} />
      </div>
      <PrintHeader title={title} period={period} />
    </>
  );
}

function PartyReport({ title, partyLabel, fetcher, keyName }: { title: string; partyLabel: string; fetcher: any; keyName: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => { fetcher().then(setData).catch((e: any) => setErr(e.message)); }, []);
  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!data) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;
  const totals = data.totals || { subtotal: 0, vat: 0, total: 0 };
  const parties = Object.entries((data[keyName] || {}) as Record<string, any>);
  const sar = (n: number) => `${Number(n || 0).toFixed(2)} ${t('currency')}`;
  return (
    <div>
      <PrintBar title={title} />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Kpi label={t('rep.base')} value={sar(totals.subtotal)} />
        <Kpi label={t('vat')} value={sar(totals.vat)} />
        <Kpi label={t('total')} value={sar(totals.total)} />
      </div>
      <Card>
        <h3 className="font-bold text-sm mb-2">{title} {t('rep.by')} {partyLabel}</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{partyLabel}</th><th className="text-start">{t('rep.count')}</th><th className="text-start">{t('total')}</th></tr></thead>
          <tbody>{parties.map(([name, v]: any) => <tr key={name} className="border-t border-[#E7E5DE]"><td className="py-1.5">{name}</td><td dir="ltr">{Number(v?.count || 0)}</td><td dir="ltr">{Number(v?.total || 0).toFixed(2)}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

function InventoryReport() {
  const { t, lang } = useI18n();
  const [data, setData] = useState<any>(null);
  useEffect(() => { api.getInventoryReport().then(setData).catch(() => setData({ products: [], lowStockCount: 0 })); }, []);
  if (!data) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;
  const products = Array.isArray(data.products) ? data.products : [];
  const nm = (p: any) => (lang === 'en' ? p.nameEn || p.nameAr : p.nameAr);
  const cat = (p: any) => (lang === 'en' ? p.categoryEn || p.category : p.category) || '—';
  return (
    <div>
      <PrintBar title={t('rep.inventory')} />
      <Kpi label={t('rep.low')} value={String(data.lowStockCount)} />
      <Card className="mt-4">
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('item')}</th><th className="text-start">{t('category')}</th><th className="text-start">{t('totalQty')}</th><th className="text-start">{t('status')}</th></tr></thead>
          <tbody>
            {products.map((p: any) => (
              <tr key={p.sku} className="border-t border-[#E7E5DE]"><td className="py-1.5">{nm(p)}</td><td>{cat(p)}</td><td dir="ltr">{p.totalQty}</td><td>{p.lowStock ? <span className="text-red-600 font-bold">{t('rep.lowState')}</span> : t('rep.okState')}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function ExpensesReport() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<any>(null);
  useEffect(() => { api.getExpensesReport().then(setD).catch(() => setD({ items: [], total: 0, from: '', to: '' })); }, []);
  if (!d) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;
  const items = Array.isArray(d.items) ? d.items : [];
  const period = `${t('from')} ${String(d.from).slice(0, 10)} ${t('to')} ${String(d.to).slice(0, 10)}`;
  return (
    <div>
      <PrintBar title={t('rep.expenses')} period={period} />
      <Card>
        <h3 className="font-bold text-sm mb-2">{t('rep.expTitle')} — {period}</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('account')}</th><th className="text-start">{t('amount')}</th><th className="text-start">{t('rep.share')}</th></tr></thead>
          <tbody>{items.map((i: any) => (
            <tr key={i.code} className="border-t border-[#E7E5DE]"><td className="py-1.5">{i.code} — {lang === 'en' ? i.nameEn || i.nameAr : i.nameAr}</td>
              <td dir="ltr" className="font-mono">{money(i.amount)}</td>
              <td>{d.total ? ((i.amount / d.total) * 100).toFixed(1) : 0}%</td></tr>
          ))}</tbody>
          <tfoot><tr className="border-t-2 border-navy font-bold"><td className="py-2">{t('total')}</td><td dir="ltr" className="font-mono">{money(d.total)}</td><td></td></tr></tfoot>
        </table>
      </Card>
    </div>
  );
}

function LedgerReport() {
  const { t, lang } = useI18n();
  const [code, setCode] = useState('1101');
  const [data, setData] = useState<any>(null);
  async function load() { setData(await api.getAccountStatement(code)); }
  return (
    <div>
      <div className="flex gap-2 mb-4 print:hidden">
        <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rep.acctPh')} value={code} onChange={(e) => setCode(e.target.value)} />
        <button onClick={load} className="bg-navy text-white rounded-lg px-4 text-sm">{t('rep.show')}</button>
      </div>
      {data && (
        <div>
          <PrintBar title={`${t('rep.ledger')} ${code}`} />
          <Card>
            <table className="w-full text-sm">
              <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('date')}</th><th className="text-start">{t('description')}</th><th className="text-start">{t('debit')}</th><th className="text-start">{t('credit')}</th><th className="text-start">{t('balance')}</th></tr></thead>
              <tbody>
                <tr className="border-t border-[#E7E5DE] bg-[#F6F5F1]"><td colSpan={4} className="py-1.5 font-bold">{t('trial.opening')}</td><td dir="ltr" className="font-mono font-bold">{Number(data.openingBalance).toFixed(2)}</td></tr>
                {(Array.isArray(data.movements) ? data.movements : []).map((r: any, i: number) => (
                  <tr key={i} className="border-t border-[#E7E5DE]"><td className="py-1.5">{gdate(r?.date)}</td><td>{localizeNote(r?.descAr, lang)}</td><td dir="ltr" className="font-mono">{Number(r?.debit) ? Number(r.debit).toFixed(2) : '—'}</td><td dir="ltr" className="font-mono">{Number(r?.credit) ? Number(r.credit).toFixed(2) : '—'}</td><td dir="ltr" className="font-mono">{Number(r?.balance || 0).toFixed(2)}</td></tr>
                ))}
                <tr className="border-t-2 border-navy font-bold"><td colSpan={2} className="py-2">{t('rep.closing')}</td><td dir="ltr" className="font-mono">{Number(data.totals?.debit || 0).toFixed(2)}</td><td dir="ltr" className="font-mono">{Number(data.totals?.credit || 0).toFixed(2)}</td><td dir="ltr" className="font-mono">{Number(data.closingBalance).toFixed(2)}</td></tr>
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
