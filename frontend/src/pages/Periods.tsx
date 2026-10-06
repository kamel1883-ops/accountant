import React, { useEffect, useState } from 'react';
import { api, openPdf } from '../api/client';
import { Card } from '../components/Layout';
import { localizeNote, useI18n } from '../i18n';
import { ExcelButton, money, inp, lbl, gdate, PrintHeader } from '../components/fin';

type L = { accountCode: string; debit: string; credit: string };

export default function Periods() {
  const { t, lang } = useI18n();
  const nm = (a: any) => (lang === 'en' ? a.nameEn || a.nameAr : a.nameAr);
  const [years, setYears] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [tab, setTab] = useState<'opening' | 'closing'>('opening');
  const [lines, setLines] = useState<L[]>([{ accountCode: '', debit: '', credit: '' }, { accountCode: '', debit: '', credit: '' }]);
  const [preview, setPreview] = useState<any>(null);
  const [msg, setMsg] = useState<{ ok?: boolean; t: string } | null>(null);
  const [ny, setNy] = useState({ name: String(new Date().getFullYear()), startDate: `${new Date().getFullYear()}-01-01`, endDate: `${new Date().getFullYear()}-12-31` });

  function load() {
    api.getFiscalYears().then((y) => setYears(Array.isArray(y) ? y : [])).catch(() => setYears([]));
    api.getAccounts().then((a: any) => setAccounts(Array.isArray(a) ? a.filter((x: any) => !x.isGroup) : [])).catch(() => setAccounts([]));
  }
  useEffect(load, []);

  async function pick(y: any) {
    setSel(y); setMsg(null); setPreview(null);
    const o = await api.getOpening(y.id);
    if (o?.entry && Array.isArray(o.entry.lines)) setLines(o.entry.lines.map((l: any) => ({ accountCode: l.accountCode, debit: String(Number(l.debit) || ''), credit: String(Number(l.credit) || '') })));
    else setLines([{ accountCode: '', debit: '', credit: '' }, { accountCode: '', debit: '', credit: '' }]);
  }

  const num = (v: string) => Number(v) || 0;
  const td = lines.reduce((s, l) => s + num(l.debit), 0), tc = lines.reduce((s, l) => s + num(l.credit), 0);
  const balanced = Math.abs(td - tc) < 0.005 && td > 0;

  async function createYear(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await api.addFiscalYear(ny); load(); setMsg({ ok: true, t: t('fy.created') }); }
    catch (x: any) { setMsg({ t: x.message }); }
  }
  async function saveOpening() {
    setMsg(null);
    try {
      const r = await api.saveOpening(sel.id, lines.filter((l) => l.accountCode && (num(l.debit) || num(l.credit))).map((l) => ({ accountCode: l.accountCode, debit: num(l.debit), credit: num(l.credit) })));
      setMsg({ ok: true, t: `${r.message} — ${t('fy.entryNo')} ${r.entry.number}` }); load();
    } catch (x: any) { setMsg({ t: x.message }); }
  }
  async function doPreview() { setMsg(null); try { setPreview(await api.getClosingPreview(sel.id)); } catch (x: any) { setMsg({ t: x.message }); } }
  async function doClose() {
    if (!confirm(t('fy.closeAsk'))) return;
    try { const r = await api.closeYear(sel.id, { transferToRetained: true, lock: true }); setMsg({ ok: true, t: `${r.message} — ${t('fy.result')} ${money(r.netProfit)} ${t('currency')}` }); load(); pick(sel); }
    catch (x: any) { setMsg({ t: x.message }); }
  }
  async function doReopen() {
    if (!confirm(t('fy.reopenAsk'))) return;
    try { const r = await api.reopenYear(sel.id); setMsg({ ok: true, t: r.message }); load(); } catch (x: any) { setMsg({ t: x.message }); }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('nav.periods')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('fy.sub')}</p>
      <div className="flex justify-end gap-2 mb-2 print:hidden">
        <button onClick={() => window.print()} className="text-xs border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold">🖨 {t('print')}</button>
        <ExcelButton title={t('nav.periods')} size="xs" />
      </div>
      <PrintHeader title={t('nav.periods')} />

      <Card>
        <h3 className="font-bold text-sm mb-2">{t('fy.years')}</h3>
        <form onSubmit={createYear} className="grid md:grid-cols-4 gap-2 items-end mb-3 print:hidden">
          <div><label className={lbl}>{t('fy.name')}</label><input className={inp} value={ny.name} onChange={(e) => setNy({ ...ny, name: e.target.value })} /></div>
          <div><label className={lbl}>{t('from')}</label><input type="date" className={inp} value={ny.startDate} onChange={(e) => setNy({ ...ny, startDate: e.target.value })} /></div>
          <div><label className={lbl}>{t('to')}</label><input type="date" className={inp} value={ny.endDate} onChange={(e) => setNy({ ...ny, endDate: e.target.value })} /></div>
          <button className="bg-navy text-white rounded-lg py-2 text-sm">{t('fy.add')}</button>
        </form>
        <div className="hidden print:block text-sm mb-2">
          {years.map((y) => (
            <div key={y.id}>{y.name} — {gdate(y.startDate)} {t('to')} {gdate(y.endDate)}{y.closed ? ` — ${t('fy.closed')}` : ''}</div>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap print:hidden">
          {years.map((y) => (
            <button key={y.id} onClick={() => pick(y)} className={`text-sm rounded-lg px-4 py-2 border ${sel?.id === y.id ? 'bg-navy text-white border-navy' : 'border-[#E7E5DE]'}`}>
              {y.name} {y.closed && <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 mr-1">{t('fy.closed')}</span>}
            </button>
          ))}
          {years.length === 0 && <p className="text-xs text-[#6C6A82]">{t('fy.none')}</p>}
        </div>
      </Card>

      {msg && <p className={`text-sm mb-3 ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.t}</p>}

      {sel && (
        <>
          <div className="flex gap-2 mb-3">
            <button onClick={() => setTab('opening')} className={`text-sm px-4 py-1.5 rounded-lg ${tab === 'opening' ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t('fy.openingOf')}</button>
            <button onClick={() => { setTab('closing'); doPreview(); }} className={`text-sm px-4 py-1.5 rounded-lg ${tab === 'closing' ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t('fy.closingTab')}</button>
          </div>

          {tab === 'opening' && (
            <Card>
              <h3 className="font-bold text-sm mb-2">{t('fy.openingOf')} — {sel.name}</h3>
              <p className="text-xs text-[#6C6A82] mb-3">{t('fy.openingHint')}</p>
              <table className="w-full text-sm">
                <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start">{t('account')}</th><th className="text-start w-32">{t('debit')}</th><th className="text-start w-32">{t('credit')}</th><th className="w-8"></th></tr></thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-1"><select className={inp} value={l.accountCode} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, accountCode: e.target.value } : x))}>
                        <option value="">{t('journal.selectAccount')}</option>{accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {nm(a)}</option>)}
                      </select></td>
                      <td className="p-1"><input type="number" className={inp} value={l.debit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, debit: e.target.value, credit: e.target.value ? '' : x.credit } : x))} /></td>
                      <td className="p-1"><input type="number" className={inp} value={l.credit} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, credit: e.target.value, debit: e.target.value ? '' : x.debit } : x))} /></td>
                      <td>{lines.length > 2 && <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="text-red-600 text-xs">✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t-2 border-navy font-bold"><td className="py-2">{t('total')}</td><td dir="ltr" className="font-mono">{money(td)}</td><td dir="ltr" className="font-mono">{money(tc)}</td><td></td></tr></tfoot>
              </table>
              <div className="flex gap-2 items-center mt-3">
                <button onClick={() => setLines([...lines, { accountCode: '', debit: '', credit: '' }])} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-1.5">{t('journal.addLine')}</button>
                <span className={`text-sm font-bold ms-auto ${balanced ? 'text-green-700' : 'text-red-600'}`}>{balanced ? `✓ ${t('balanced')}` : `${t('notBalanced')} — ${t('difference')} ${money(Math.abs(td - tc))}`}</span>
                <button disabled={!balanced || sel.closed} onClick={saveOpening} className="bg-gold text-navy font-bold rounded-lg py-2 px-6 text-sm disabled:opacity-50">{t('fy.saveOpening')}</button>
              </div>
            </Card>
          )}

          {tab === 'closing' && (
            <Card>
              <h3 className="font-bold text-sm mb-2">{t('fy.closingTab')} — {sel.name}</h3>
              {!preview ? <p className="text-xs text-[#6C6A82]">{t('loading')}</p> : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-[#F6F5F1] rounded-lg p-3"><div className="text-xs text-[#6C6A82]">{t('fy.netRev')}</div><div dir="ltr" className="font-mono font-bold">{money(preview.revenue)}</div></div>
                    <div className="bg-[#F6F5F1] rounded-lg p-3"><div className="text-xs text-[#6C6A82]">{t('fy.netExp')}</div><div dir="ltr" className="font-mono font-bold">{money(preview.expenses)}</div></div>
                    <div className="bg-navy text-white rounded-lg p-3"><div className="text-xs opacity-80">{preview.netProfit >= 0 ? t('st.netProfit') : t('st.netLoss')}</div><div dir="ltr" className="font-mono font-bold">{money(Math.abs(preview.netProfit))}</div></div>
                  </div>
                  <p className="text-xs text-[#6C6A82] mb-2">{t('fy.preview')}</p>
                  <table className="w-full text-sm">
                    <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('account')}</th><th className="text-start">{t('description')}</th><th className="text-start">{t('debit')}</th><th className="text-start">{t('credit')}</th></tr></thead>
                    <tbody>{(Array.isArray(preview.lines) ? preview.lines : []).map((l: any, i: number) => (
                      <tr key={i} className="border-t border-[#E7E5DE]"><td className="py-1 font-mono">{l.accountCode}</td><td>{localizeNote(l.descAr, lang)}</td>
                        <td dir="ltr" className="font-mono">{l.debit ? money(l.debit) : '—'}</td><td dir="ltr" className="font-mono">{l.credit ? money(l.credit) : '—'}</td></tr>
                    ))}</tbody>
                    <tfoot><tr className="border-t-2 border-navy font-bold"><td colSpan={2} className="py-2">{t('total')}</td><td dir="ltr" className="font-mono">{money(preview.totalDebit)}</td><td dir="ltr" className="font-mono">{money(preview.totalCredit)}</td></tr></tfoot>
                  </table>
                  <div className="flex gap-2 mt-3">
                    {!sel.closed && <button onClick={doClose} className="bg-gold text-navy font-bold rounded-lg py-2 px-6 text-sm">{t('fy.doClose')}</button>}
                    {sel.closed && <>
                      <span className="text-sm text-green-700 font-bold py-2">✓ {t('fy.yearClosed')}</span>
                      {sel.closingEntryId && <button onClick={() => openPdf(`/journal/${sel.closingEntryId}/print`)} className="border border-[#E7E5DE] rounded-lg py-2 px-4 text-sm">{t('fy.printClose')}</button>}
                      <button onClick={doReopen} className="text-sm underline text-red-600">{t('fy.reopen')}</button>
                    </>}
                  </div>
                </>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
