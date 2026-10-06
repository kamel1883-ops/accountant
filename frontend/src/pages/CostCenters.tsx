import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

const TYPES = ['BRANCH', 'DEPARTMENT', 'PROJECT', 'CHANNEL', 'WAREHOUSE', 'SUPPORT'];

export default function CostCenters() {
  const { t, lang } = useI18n();
  const nm = (c: any) => (lang === 'en' ? c.nameEn || c.nameAr : c.nameAr);
  const [rows, setRows] = useState<any[]>([]);
  const [income, setIncome] = useState<any[]>([]);
  const [profit, setProfit] = useState(0);
  const [form, setForm] = useState({ code: '', nameAr: '', nameEn: '', type: 'BRANCH', parentId: '', managerName: '', address: '', phone: '' });
  const [rule, setRule] = useState({ code: '', nameAr: '', a: '', ap: '60', b: '', bp: '40' });
  const [error, setError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [trialCenter, setTrialCenter] = useState('');
  const [trial, setTrial] = useState<any>(null);
  const [ledger, setLedger] = useState<any[]>([]);

  function load() {
    api.getCostCenters().then((d) => setRows(Array.isArray(d) ? d : [])).catch(() => setRows([]));
    api.costCenterIncome(from, to).then((d) => { setIncome(d.rows || []); setProfit(Number(d.profit) || 0); }).catch(() => setIncome([]));
    api.costCenterTrial(trialCenter, from, to).then(setTrial).catch(() => setTrial(null));
    if (trialCenter) api.costCenterLedger(trialCenter, from, to).then((d) => setLedger(Array.isArray(d) ? d : [])).catch(() => setLedger([]));
    else setLedger([]);
  }
  useEffect(load, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.addCostCenter({ ...form, parentId: form.parentId || undefined });
      setForm({ code: '', nameAr: '', nameEn: '', type: 'BRANCH', parentId: '', managerName: '', address: '', phone: '' });
      load();
    } catch (err: any) { setError(err.message); }
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.addAllocationRule({
        code: rule.code, nameAr: rule.nameAr,
        lines: [{ costCenterId: rule.a, percentage: Number(rule.ap) }, { costCenterId: rule.b, percentage: Number(rule.bp) }],
      });
      setRule({ code: '', nameAr: '', a: '', ap: '60', b: '', bp: '40' });
      load();
    } catch (err: any) { setError(err.message); }
  }

  const active = rows.filter((r) => r.status === 'ACTIVE');

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('cc.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">{t('cc.sub')}</p>
      <Card className="print:hidden">
        <form onSubmit={save} className="grid grid-cols-3 gap-2">
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.name')} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.nameEn')} value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} />
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {TYPES.map((k) => <option key={k} value={k}>{t(`cc.type.${k}`)}</option>)}
          </select>
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
            <option value="">{t('cc.parent')}</option>
            {active.map((c) => <option key={c.id} value={c.id}>{c.code} — {nm(c)}</option>)}
          </select>
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.manager')} value={form.managerName} onChange={(e) => setForm({ ...form, managerName: e.target.value })} />
          {form.type === 'BRANCH' && <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.address')} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />}
          {form.type === 'BRANCH' && <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.phone')} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          {error && <p className="col-span-3 text-red-600 text-xs">{error}</p>}
          <button className="col-span-3 bg-gold text-navy font-bold rounded-lg py-2 text-sm">{t('cc.add')}</button>
        </form>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('cc.code')}</th><th className="text-start">{t('cc.name')}</th><th className="text-start">{t('type')}</th><th className="text-start">{t('status')}</th><th /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[#E7E5DE]">
                <td className="py-1.5">{c.code}</td><td>{nm(c)}</td><td>{t(`cc.type.${c.type}`)}</td>
                <td>{c.status === 'ACTIVE' ? t('cc.active') : t('cc.stopped')}</td>
                <td>{c.status === 'ACTIVE' && <button type="button" className="text-xs underline" onClick={() => api.stopCostCenter(c.id).then(load).catch((e: any) => setError(e.message))}>{t('cc.stop')}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card className="print:hidden">
        <h3 className="font-bold text-sm mb-2">{t('cc.rule')}</h3>
        <form onSubmit={saveRule} className="grid grid-cols-3 gap-2">
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('cc.code')} value={rule.code} onChange={(e) => setRule({ ...rule, code: e.target.value })} />
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm col-span-2" placeholder={t('cc.ruleName')} value={rule.nameAr} onChange={(e) => setRule({ ...rule, nameAr: e.target.value })} />
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={rule.a} onChange={(e) => setRule({ ...rule, a: e.target.value })}>
            <option value="">{t('cc.pick')}</option>{active.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
          </select>
          <input type="number" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={rule.ap} onChange={(e) => setRule({ ...rule, ap: e.target.value })} />
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={rule.b} onChange={(e) => setRule({ ...rule, b: e.target.value })}>
            <option value="">{t('cc.pick')}</option>{active.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
          </select>
          <input type="number" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={rule.bp} onChange={(e) => setRule({ ...rule, bp: e.target.value })} />
          <button className="col-span-2 bg-navy text-white rounded-lg text-sm">{t('cc.addRule')}</button>
        </form>
      </Card>
      <Card>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <h3 className="font-bold text-sm">{t('cc.income')}</h3>
          <label className="text-xs text-[#6C6A82]">{t('from')}<input type="date" className="block border border-[#E7E5DE] rounded-lg p-1.5 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="text-xs text-[#6C6A82]">{t('to')}<input type="date" className="block border border-[#E7E5DE] rounded-lg p-1.5 text-sm" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button type="button" className="text-sm border border-[#E7E5DE] rounded-lg px-3 py-1.5" onClick={load}>{t('cc.income')}</button>
          <button type="button" className="text-sm border border-[#E7E5DE] rounded-lg px-3 py-1.5" onClick={() => window.print()}>{t('print')}</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start">{t('cc.name')}</th><th>{t('st.netSales')}</th><th>{t('dash.purchases')}</th><th>{t('cc.gross')}</th><th>{t('st.opex')}</th><th>{t('st.netProfit')}</th><th>{t('cc.margin')}</th></tr></thead>
          <tbody>
            {income.map((r) => (
              <tr key={r.centerId || 'none'} className="border-t border-[#E7E5DE]">
                <td className="py-1.5">{lang === 'en' ? r.nameEn : r.nameAr}</td>
                <td>{Number(r.netSales).toFixed(2)}</td>
                <td>{Number(r.cogs).toFixed(2)}</td>
                <td>{Number(r.gross).toFixed(2)}</td>
                <td>{Number(r.expenses).toFixed(2)}</td>
                <td className="font-bold">{Number(r.profit).toFixed(2)}</td>
                <td>{Number(r.margin).toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-sm mt-3">{t('cc.unified')}: <b>{profit.toFixed(2)}</b></p>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <h3 className="font-bold text-sm">{t('nav.trial')}</h3>
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={trialCenter} onChange={(e) => setTrialCenter(e.target.value)}>
            <option value="">{t('cc.unified')}</option>
            {rows.map((c) => <option key={c.id} value={c.id}>{c.code} — {nm(c)}</option>)}
          </select>
          <button type="button" className="text-sm border border-[#E7E5DE] rounded-lg px-3 py-1.5" onClick={load}>{t('nav.trial')}</button>
          {trial && <span className="text-xs">{trial.balanced ? '✓' : '!'} {Number(trial.debit).toFixed(2)} / {Number(trial.credit).toFixed(2)}</span>}
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start">{t('cc.code')}</th><th className="text-start">{t('cc.name')}</th><th>{t('debit')}</th><th>{t('credit')}</th></tr></thead>
          <tbody>
            {(trial?.rows || []).map((r: any) => (
              <tr key={r.code} className="border-t border-[#E7E5DE]">
                <td className="py-1">{r.code}</td><td>{lang === 'en' ? r.nameEn || r.nameAr : r.nameAr}</td>
                <td>{Number(r.debit).toFixed(2)}</td><td>{Number(r.credit).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {trialCenter && (
        <Card>
          <h3 className="font-bold text-sm mb-2">{t('rep.ledger')}</h3>
          <table className="w-full text-sm">
            <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start">{t('date')}</th><th className="text-start">{t('cc.code')}</th><th className="text-start">{t('cc.name')}</th><th>{t('debit')}</th><th>{t('credit')}</th></tr></thead>
            <tbody>
              {ledger.map((l, i) => (
                <tr key={`${l.entryId}-${i}`} className="border-t border-[#E7E5DE]">
                  <td className="py-1">{String(l.date).slice(0, 10)}</td>
                  <td>{l.number || l.accountCode}</td>
                  <td>{l.descAr}</td>
                  <td>{Number(l.debit).toFixed(2)}</td>
                  <td>{Number(l.credit).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
