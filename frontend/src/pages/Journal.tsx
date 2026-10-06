import React, { useEffect, useMemo, useState } from 'react';
import { api, openPdf } from '../api/client';
import { Card } from '../components/Layout';
import { ExcelButton, money, gdate, inp, lbl, today, PrintHeader } from '../components/fin';
import { localizeNote, useI18n } from '../i18n';
import { CostCenterSelect } from '../components/CostCenterSelect';

type L = { accountCode: string; descAr: string; debit: string; credit: string };
const blank = (): L => ({ accountCode: '', descAr: '', debit: '', credit: '' });

function asList(v: unknown): any[] {
  return Array.isArray(v) ? v : [];
}

export default function Journal() {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [date, setDate] = useState(today());
  const [descAr, setDescAr] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [lines, setLines] = useState<L[]>([blank(), blank()]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [openLines, setOpenLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([api.getJournal(), api.getAccounts()])
      .then(([j, a]) => {
        setEntries(asList(j));
        setAccounts(asList(a).filter((x) => x && !x.isGroup && x.active !== false && x.code));
      })
      .catch((e: any) => setError(e.message || t('journal.loadFail')))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const num = (v: string) => Number(v) || 0;
  const totalDebit = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit), 0);
  const diff = Math.round((totalDebit - totalCredit) * 100) / 100;
  const balanced = Math.abs(diff) < 0.005 && totalDebit > 0;

  const accountOptions = useMemo(() => accounts.map((a) => (
    <option key={a.id || a.code} value={a.code}>{a.code} — {lang === 'en' ? a.nameEn || a.nameAr : a.nameAr}</option>
  )), [accounts, lang]);

  const upd = (i: number, p: Partial<L>) => setLines((prev) => prev.map((l, x) => (x === i ? { ...l, ...p } : l)));
  const addLines = (n: number) => setLines((prev) => [...prev, ...Array.from({ length: n }, blank)]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setOk('');
    try {
      const r = await api.addJournalEntry({
        date, descAr, costCenterId: costCenterId || undefined,
        lines: lines.filter((l) => l.accountCode && (num(l.debit) || num(l.credit)))
          .map((l) => ({ accountCode: l.accountCode, descAr: l.descAr || undefined, debit: num(l.debit), credit: num(l.credit) })),
      });
      setOk(`${t('journal.saved')} ${r.number} — ${money(r.totalDebit)} ${t('currency')}`);
      setDescAr(''); setCostCenterId(''); setLines([blank(), blank()]); load();
    } catch (x: any) { setError(x.message); }
  }

  async function del(id: string) {
    if (!confirm(t('journal.deleteAsk'))) return;
    try { await api.deleteEntry(id); load(); } catch (x: any) { alert(x.message); }
  }

  async function toggle(id: string) {
    if (open === id) { setOpen(null); setOpenLines([]); return; }
    setOpen(id); setOpenLines([]);
    try {
      const full = await api.getEntry(id);
      setOpenLines(asList(full?.lines));
    } catch (x: any) {
      setError(x.message);
      setOpen(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 print:hidden">
        <h2 className="text-xl font-bold">{t('journal.title')}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold shrink-0">🖨 {t('print')}</button>
          <ExcelButton title={t('journal.title')} />
        </div>
      </div>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('journal.sub')}</p>

      <Card className="print:hidden">
        <form onSubmit={save}>
          <div className="grid md:grid-cols-3 gap-3 mb-3">
            <div><label className={lbl}>{t('date')}</label><input type="date" className={inp} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="md:col-span-2"><label className={lbl}>{t('journal.entryDesc')}</label><input className={inp} value={descAr} onChange={(e) => setDescAr(e.target.value)} /></div>
            <div><label className={lbl}>{t('cc.pick')}</label><CostCenterSelect value={costCenterId} onChange={setCostCenterId} /></div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1 w-8">{t('journal.lineNo')}</th><th className="text-start">{t('account')}</th><th className="text-start w-48">{t('journal.lineDesc')}</th><th className="text-start w-32">{t('debit')}</th><th className="text-start w-32">{t('credit')}</th><th className="w-8"></th></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="text-[#6C6A82] text-xs">{i + 1}</td>
                    <td className="p-1">
                      <select className={inp} value={l.accountCode} onChange={(e) => upd(i, { accountCode: e.target.value })}>
                        <option value="">{t('journal.selectAccount')}</option>
                        {accountOptions}
                      </select>
                    </td>
                    <td className="p-1"><input className={inp} value={l.descAr} onChange={(e) => upd(i, { descAr: e.target.value })} /></td>
                    <td className="p-1"><input type="number" step="0.01" min="0" className={inp} value={l.debit} onChange={(e) => upd(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} /></td>
                    <td className="p-1"><input type="number" step="0.01" min="0" className={inp} value={l.credit} onChange={(e) => upd(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} /></td>
                    <td className="p-1">{lines.length > 2 && <button type="button" onClick={() => setLines((prev) => prev.filter((_, x) => x !== i))} className="text-red-600 text-xs">✕</button>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy font-bold">
                  <td colSpan={3} className="py-2">{t('total')}</td>
                  <td dir="ltr" className="font-mono px-1">{money(totalDebit)}</td>
                  <td dir="ltr" className="font-mono px-1">{money(totalCredit)}</td><td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-2 flex-wrap items-center mt-3">
            <button type="button" onClick={() => addLines(1)} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-1.5">{t('journal.addLine')}</button>
            <button type="button" onClick={() => addLines(5)} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-1.5">{t('journal.add5')}</button>
            <span className={`text-sm font-bold mr-auto ${balanced ? 'text-green-700' : 'text-red-600'}`}>
              {totalDebit === 0 && totalCredit === 0 ? t('journal.enterLines') : balanced ? `✓ ${t('balanced')}` : `${t('notBalanced')} — ${t('difference')} ${money(Math.abs(diff))}`}
            </span>
          </div>
          {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
          {ok && <p className="text-green-700 text-xs mt-2">{ok}</p>}
          <button disabled={!balanced} className="bg-gold text-navy font-bold rounded-lg py-2 px-6 text-sm mt-3 disabled:opacity-50">{t('journal.saveEntry')}</button>
        </form>
      </Card>

      <Card>
        <PrintHeader title={t('journal.title')} /><h3 className="font-bold text-sm mb-2 print:hidden">{t('journal.list')}</h3>
        {loading && <p className="text-xs text-[#6C6A82] mb-2">{t('loading')}</p>}
        {!loading && entries.length === 0 && <p className="text-xs text-[#6C6A82]">—</p>}
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1 w-16">{t('number')}</th><th className="text-start">{t('date')}</th><th className="text-start">{t('description')}</th><th className="text-start">{t('type')}</th><th className="text-start">{t('amount')}</th><th className="print:hidden"></th></tr></thead>
          <tbody>
            {entries.map((e, i) => {
              if (!e || !e.id) return null;
              const kind = typeof e.kind === 'string' && e.kind ? e.kind : 'NORMAL';
              const linesOpen = open === e.id ? asList(openLines) : [];
              return (
              <React.Fragment key={e.id || i}>
                <tr className="border-t border-[#E7E5DE]">
                  <td className="py-1.5 font-bold">{e.number ?? '—'}</td>
                  <td>{gdate(e.date)}</td>
                  <td>{localizeNote(e.descAr, lang)}{e.isAuto && <span className="text-[10px] bg-goldsoft text-navy rounded-full px-2 py-0.5 mr-2">{t('auto')}</span>}</td>
                  <td className="text-xs">{t(`kind.${kind}`)}</td>
                  <td dir="ltr" className="font-mono">{money(e.totalDebit)}</td>
                  <td className="whitespace-nowrap text-xs print:hidden">
                    <button type="button" onClick={() => toggle(e.id)} className="underline ml-2">{open === e.id ? t('hide') : t('details')}</button>
                    <button type="button" onClick={() => openPdf(`/journal/${e.id}/print`)} className="underline ml-2">{t('print')}</button>
                    {!e.isAuto && kind === 'NORMAL' && <button type="button" onClick={() => del(e.id)} className="underline text-red-600">{t('delete')}</button>}
                  </td>
                </tr>
                {open === e.id && (
                  <tr><td colSpan={6} className="bg-[#F6F5F1] p-3">
                    <table className="w-full text-xs">
                      <thead><tr className="text-[#6C6A82]"><th className="text-start">{t('account')}</th><th className="text-start">{t('description')}</th><th className="text-start">{t('debit')}</th><th className="text-start">{t('credit')}</th></tr></thead>
                      <tbody>{linesOpen.map((l: any, n: number) => (
                        <tr key={l?.id || n}>
                          <td className="py-1">{l?.accountCode || '—'} — {lang === 'en' ? (l?.accountNameEn || l?.accountName || '') : (l?.accountName || '')}</td>
                          <td>{localizeNote(l?.descAr, lang) || '—'}</td>
                          <td dir="ltr" className="font-mono">{Number(l?.debit) ? money(l.debit) : '—'}</td>
                          <td dir="ltr" className="font-mono">{Number(l?.credit) ? money(l.credit) : '—'}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </td></tr>
                )}
              </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
