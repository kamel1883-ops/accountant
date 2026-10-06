import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { ExcelButton, PrintHeader, gdate, money } from '../components/fin';
import { useI18n } from '../i18n';
import { CostCenterSelect } from '../components/CostCenterSelect';

export default function Finance() {
  const { t: tr, lang } = useI18n();
  const nm = (x: any) => (lang === 'en' ? x?.nameEn || x?.nameAr : x?.nameAr);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [tForm, setTForm] = useState({ nameAr: '', type: 'CASH', accountCode: '1101' });
  const [vForm, setVForm] = useState({ treasuryId: '', type: 'RECEIPT', party: '', amount: '', counterAccountCode: '1103', descAr: '', costCenterId: '' });
  const [rules, setRules] = useState<any[]>([]);
  const [ruleId, setRuleId] = useState('');
  const [error, setError] = useState('');

  function load() {
    api.getTreasuries().then((d) => setTreasuries(Array.isArray(d) ? d : [])).catch(() => setTreasuries([]));
    api.getVouchers().then((d) => setVouchers(Array.isArray(d) ? d : [])).catch(() => setVouchers([]));
    api.getAllocationRules().then((d) => setRules(Array.isArray(d) ? d : [])).catch(() => setRules([]));
  }
  useEffect(load, []);

  async function addTreasury(e: React.FormEvent) {
    e.preventDefault();
    await api.addTreasury(tForm);
    setTForm({ nameAr: '', type: 'CASH', accountCode: '1101' });
    load();
  }

  async function addVoucher(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const rule = rules.find((r) => r.id === ruleId);
      const allocations = rule?.lines?.map((l: any) => ({ costCenterId: l.costCenterId, percentage: Number(l.percentage) }));
      await api.addVoucher({ ...vForm, costCenterId: allocations ? undefined : (vForm.costCenterId || undefined), allocations, amount: Number(vForm.amount), date: new Date().toISOString() });
      setVForm({ treasuryId: '', type: 'RECEIPT', party: '', amount: '', counterAccountCode: '1103', descAr: '', costCenterId: '' });
      setRuleId('');
      load();
    } catch (err: any) { setError(err.message); }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 print:hidden">
        <h2 className="text-xl font-bold">{tr('fin.title')}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold shrink-0">🖨 {tr('print')}</button>
          <ExcelButton title={tr('fin.title')} />
        </div>
      </div>
      <p className="text-sm text-[#6C6A82] mb-5 print:hidden">{tr('fin.sub')}</p>
      <PrintHeader title={tr('fin.title')} />

      <Card>
        <h3 className="font-bold text-sm mb-2">{tr('fin.treasuries')}</h3>
        <form onSubmit={addTreasury} className="grid grid-cols-4 gap-2 mb-3 print:hidden">
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={tr('fin.name')} value={tForm.nameAr} onChange={(e) => setTForm({ ...tForm, nameAr: e.target.value })} />
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={tForm.type} onChange={(e) => setTForm({ ...tForm, type: e.target.value })}>
            <option value="CASH">{tr('fin.cash')}</option><option value="BANK">{tr('fin.bank')}</option>
          </select>
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={tr('fin.glPh')} value={tForm.accountCode} onChange={(e) => setTForm({ ...tForm, accountCode: e.target.value })} />
          <button className="bg-navy text-white rounded-lg text-sm">{tr('add')}</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {treasuries.map((row) => <span key={row.id} className="text-xs bg-goldsoft text-navy rounded-full px-3 py-1">{nm(row)} ({row.type === 'CASH' ? tr('fin.cashWord') : tr('fin.bankWord')})</span>)}
        </div>
      </Card>

      <Card className="print:hidden">
        <h3 className="font-bold text-sm mb-2">{tr('fin.newVoucher')}</h3>
        <form onSubmit={addVoucher} className="grid grid-cols-3 gap-2">
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={vForm.treasuryId} onChange={(e) => setVForm({ ...vForm, treasuryId: e.target.value })}>
            <option value="">{tr('treasury')}</option>{treasuries.map((row) => <option key={row.id} value={row.id}>{nm(row)}</option>)}
          </select>
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={vForm.type} onChange={(e) => setVForm({ ...vForm, type: e.target.value })}>
            <option value="RECEIPT">{tr('fin.receipt')}</option><option value="PAYMENT">{tr('fin.payment')}</option>
          </select>
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={tr('fin.party')} value={vForm.party} onChange={(e) => setVForm({ ...vForm, party: e.target.value })} />
          <input type="number" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={tr('amount')} value={vForm.amount} onChange={(e) => setVForm({ ...vForm, amount: e.target.value })} />
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={tr('fin.counterPh')} value={vForm.counterAccountCode} onChange={(e) => setVForm({ ...vForm, counterAccountCode: e.target.value })} />
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={tr('fin.descOpt')} value={vForm.descAr} onChange={(e) => setVForm({ ...vForm, descAr: e.target.value })} />
          {!ruleId && <CostCenterSelect value={vForm.costCenterId} onChange={(id) => setVForm({ ...vForm, costCenterId: id })} />}
          {rules.length > 0 && (
            <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={ruleId} onChange={(e) => setRuleId(e.target.value)}>
              <option value="">{tr('cc.rule')}</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.code} — {r.nameAr}</option>)}
            </select>
          )}
          {error && <p className="col-span-3 text-red-600 text-xs">{error}</p>}
          <button className="col-span-3 bg-gold text-navy font-bold rounded-lg py-2 text-sm">{tr('fin.saveVoucher')}</button>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{tr('date')}</th><th className="text-start">{tr('type')}</th><th className="text-start">{tr('fin.party')}</th><th className="text-start">{tr('treasury')}</th><th className="text-start">{tr('amount')}</th></tr></thead>
          <tbody>
            {vouchers.map((v) => (
              <tr key={v.id} className="border-t border-[#E7E5DE]">
                <td className="py-1.5">{gdate(v.date)}</td>
                <td>{v.type === 'RECEIPT' ? tr('fin.in') : tr('fin.out')}</td>
                <td>{v.party}</td>
                <td>{nm(v.treasury)}</td>
                <td dir="ltr" className="font-mono">{money(v.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
