import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { ExcelButton, money, inp, lbl, PrintHeader } from '../components/fin';
import { useI18n } from '../i18n';


const SUBTYPES: Record<string, string[]> = {
  ASSET: ['CURRENT_ASSET', 'CASH', 'NON_CURRENT_ASSET', 'CONTRA_ASSET'],
  LIABILITY: ['CURRENT_LIABILITY', 'NON_CURRENT_LIABILITY'],
  EQUITY: ['CAPITAL', 'RESERVES', 'RETAINED_EARNINGS', 'DRAWINGS'],
  SALES: ['SALES_REVENUE', 'SALES_RETURNS', 'OTHER_INCOME'],
  PURCHASES: ['PURCHASES_COST', 'PURCHASE_RETURNS', 'OPERATING_EXPENSE', 'DEPRECIATION', 'OTHER_EXPENSE'],
};

export default function ChartOfAccounts() {
  const { t, lang } = useI18n();
  const nm = (a: any) => (lang === 'en' ? a.nameEn || a.nameAr : a.nameAr);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [openRoot, setOpenRoot] = useState<string | null>(null);
  const [parent, setParent] = useState<any>(null);
  const [f, setF] = useState({ code: '', nameAr: '', nameEn: '', subtype: '', isGroup: false });
  const [error, setError] = useState('');

  const load = () => api.getAccountsWithBalances().then((a) => setAccounts(Array.isArray(a) ? a : [])).catch(() => setAccounts([]));
  useEffect(load, []);

  const roots = accounts.filter((a) => !a.parentId);
  const kids = (id: string) => accounts.filter((a) => a.parentId === id);

  function startAdd(p: any) {
    setParent(p); setError('');
    const sibs = kids(p.id);
    const next = sibs.length ? String(Math.max(...sibs.map((s) => Number(s.code) || 0)) + 1) : p.code + '01';
    setF({ code: next, nameAr: '', nameEn: '', subtype: p.subtype || '', isGroup: false });
  }

  async function add(e: React.FormEvent) {
    e.preventDefault(); setError('');
    try { await api.addAccount({ parentId: parent.id, ...f, subtype: f.subtype || undefined }); setParent(null); load(); }
    catch (x: any) { setError(x.message); }
  }
  async function remove(a: any) {
    if (!confirm(`${t('fy.deleteAsk')} ${a.code} — ${nm(a)}?`)) return;
    try { await api.deleteAccount(a.id); load(); } catch (x: any) { alert(x.message); }
  }

  const Node = ({ a, depth, seen }: { a: any; depth: number; seen: Set<string> }) => {
    if (!a?.id || seen.has(a.id) || depth > 12) return null;
    const next = new Set(seen);
    next.add(a.id);
    const ch = kids(a.id);
    return (
      <>
        <tr className="border-t border-[#E7E5DE]">
          <td className="py-1.5" style={{ paddingInlineStart: depth * 18 }}>
            <span className="text-[#6C6A82] text-xs ml-2 font-mono">{a.code}</span>
            <span className={a.isGroup ? 'font-bold' : ''}>{nm(a)}</span>
            {a.isGroup && <span className="text-[10px] bg-goldsoft text-navy rounded-full px-2 py-0.5 mr-2">{t('coa.group')}</span>}
            {a.active === false && <span className="text-[10px] bg-red-100 text-red-700 rounded-full px-2 py-0.5 mr-2">{t('coa.inactive')}</span>}
          </td>
          <td className="text-xs text-[#6C6A82]">{lang === 'en' ? a.nameAr : a.nameEn}</td>
          <td dir="ltr" className={`font-mono text-sm ${a.isGroup ? 'font-bold' : ''}`}>{money(a.balance || 0)}</td>
          <td className="whitespace-nowrap text-xs print:hidden">
            <button onClick={() => startAdd(a)} className="underline ml-2">{t('coa.addSub')}</button>
            {!a.isSystem && <button onClick={() => remove(a)} className="underline text-red-600">{t('delete')}</button>}
          </td>
        </tr>
        {ch.map((c) => <Node key={c.id} a={c} depth={depth + 1} seen={next} />)}
      </>
    );
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('coa.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('coa.sub')}</p>
      <div className="flex justify-end gap-2 mb-2 print:hidden">
        <button onClick={() => window.print()} className="text-xs border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold">🖨 {t('print')}</button>
        <ExcelButton title={t('coa.title')} size="xs" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 print:hidden">
        {roots.map((r) => (
          <button key={r.id} onClick={() => setOpenRoot(openRoot === r.id ? null : r.id)}
            className={`rounded-xl p-3 text-start border ${openRoot === r.id ? 'bg-navy text-white border-navy' : 'bg-white border-[#E7E5DE]'}`}>
            <div className="text-xs opacity-70">{r.code} · {t(`type.${r.type}`)}</div>
            <div className="font-bold text-sm">{nm(r)}</div>
            <div dir="ltr" className="font-mono text-xs mt-1">{money(r.balance || 0)}</div>
          </button>
        ))}
      </div>

      {parent && (
        <Card>
          <h3 className="font-bold text-sm mb-2">{t('coa.newUnder')}: {parent.code} — {nm(parent)}</h3>
          <form onSubmit={add} className="grid md:grid-cols-5 gap-2 items-end">
            <div><label className={lbl}>{t('coa.code')}</label><input required className={inp} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></div>
            <div><label className={lbl}>{t('coa.nameAr')}</label><input required className={inp} value={f.nameAr} onChange={(e) => setF({ ...f, nameAr: e.target.value })} /></div>
            <div><label className={lbl}>{t('coa.nameEn')}</label><input className={inp} value={f.nameEn} onChange={(e) => setF({ ...f, nameEn: e.target.value })} /></div>
            <div><label className={lbl}>{t('coa.subtype')}</label>
              <select className={inp} value={f.subtype} onChange={(e) => setF({ ...f, subtype: e.target.value })}>
                <option value="">{t('coa.fromParent')}</option>
                {(SUBTYPES[parent.type] || []).map((v) => <option key={v} value={v}>{t(`sub.${v}`)}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button className="bg-gold text-navy font-bold rounded-lg py-2 px-4 text-sm flex-1">{t('add')}</button>
              <button type="button" onClick={() => setParent(null)} className="border border-[#E7E5DE] rounded-lg py-2 px-3 text-sm">{t('cancel')}</button>
            </div>
            <label className="md:col-span-5 text-xs flex items-center gap-2"><input type="checkbox" checked={f.isGroup} onChange={(e) => setF({ ...f, isGroup: e.target.checked })} /> {t('coa.isGroup')}</label>
            {error && <p className="md:col-span-5 text-red-600 text-xs">{error}</p>}
          </form>
        </Card>
      )}

      <Card>
        <PrintHeader title={t('coa.title')} />
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('account')}</th><th className="text-start">{lang === 'en' ? t('coa.nameAr') : t('coa.nameEn')}</th><th className="text-start">{t('balance')}</th><th className="print:hidden"></th></tr></thead>
          <tbody>{(openRoot ? roots.filter((r) => r.id === openRoot) : roots).map((r) => <Node key={r.id} a={r} depth={0} seen={new Set()} />)}</tbody>
        </table>
      </Card>
    </div>
  );
}
