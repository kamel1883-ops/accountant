import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { PrintBar, today } from '../components/fin';
import { gdate, useI18n } from '../i18n';

type Line = {
  id: string;
  warehouseId: string;
  sku: string;
  nameAr: string;
  nameEn?: string;
  categoryAr?: string;
  categoryEn?: string;
  expectedQty: number;
  countedQty: number | null;
  variance: number | null;
};
type Warehouse = { id: string; nameAr: string; nameEn?: string; branchId?: string; branch?: { id: string; nameAr: string; nameEn?: string } };
type Branch = { id: string; nameAr: string; nameEn?: string };
type Section = { warehouse: Warehouse; items: number; systemQty: number; lines: Line[] };
type Sheet = {
  id: string;
  status: string;
  countedOn: string;
  createdAt: string;
  submittedAt: string | null;
  warehouses: Warehouse[];
  sections: Section[];
  lines: Line[];
};
type Saved = {
  id: string;
  status: string;
  countedOn: string;
  createdAt: string;
  submittedAt: string | null;
  warehouses: Warehouse[];
  items: number;
  matched: number;
  over: number;
  short: number;
  pending: number;
};

function stamp(d: string | null) {
  if (!d) return '—';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`;
}

export default function StockCount() {
  const { t, lang } = useI18n();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [mode, setMode] = useState<'warehouse' | 'branch'>('warehouse');
  const [picked, setPicked] = useState<string[]>([]);
  const [countedOn, setCountedOn] = useState(today());
  const [count, setCount] = useState<Sheet | null>(null);
  const [error, setError] = useState('');

  function loadSaved() {
    api.listStockCounts().then((d) => setSaved(Array.isArray(d) ? d : [])).catch(() => setSaved([]));
  }

  useEffect(() => {
    api.getWarehouses().then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => setWarehouses([]));
    api.getBranches().then((d) => setBranches(Array.isArray(d) ? d : [])).catch(() => setBranches([]));
    loadSaved();
  }, []);

  function nameOf(w?: { nameAr: string; nameEn?: string }) {
    if (!w) return '';
    return lang === 'en' ? w.nameEn || w.nameAr : w.nameAr;
  }
  function itemName(l: Line) {
    return lang === 'en' ? l.nameEn || l.nameAr : l.nameAr;
  }
  function categoryName(l: Line) {
    return lang === 'en' ? l.categoryEn || l.categoryAr || '' : l.categoryAr || l.categoryEn || '';
  }
  function namesOf(list?: Warehouse[]) {
    return (list || []).map(nameOf).filter(Boolean).join('، ') || '—';
  }

  const choices = mode === 'branch' ? branches : warehouses;
  const allOn = choices.length > 0 && picked.length === choices.length;

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function switchMode(next: 'warehouse' | 'branch') {
    setMode(next);
    setPicked([]);
  }

  const warehouseGroups = branches.map((b) => ({
    branch: b,
    warehouses: warehouses.filter((w) => (w.branchId || w.branch?.id) === b.id),
  })).filter((g) => g.warehouses.length);

  async function openNew() {
    setError('');
    if (!picked.length) { setError(mode === 'branch' ? t('sc.needBranch') : t('sc.needWh')); return; }
    try {
      setCount(await api.openStockCount({
        mode,
        warehouseIds: mode === 'warehouse' ? picked : [],
        branchIds: mode === 'branch' ? picked : [],
        all: allOn,
        countedOn,
      }));
      loadSaved();
    } catch (e: any) { setError(e.message); }
  }

  async function openSaved(id: string) {
    setError('');
    try { setCount(await api.getStockCount(id)); } catch (e: any) { setError(e.message); }
  }

  async function updateLine(lineId: string, val: string) {
    if (!count || val === '') return;
    const updated = await api.setCountedQty(count.id, lineId, Number(val));
    const patch = (l: Line) => (l.id === lineId ? { ...l, countedQty: updated.countedQty, variance: updated.variance } : l);
    setCount((c) => c && ({
      ...c,
      lines: c.lines.map(patch),
      sections: c.sections.map((s) => ({ ...s, lines: s.lines.map(patch) })),
    }));
  }

  async function submit() {
    if (!count) return;
    setError('');
    try {
      setCount(await api.submitStockCount(count.id));
      loadSaved();
    } catch (e: any) { setError(e.message); }
  }

  const lines = count?.lines || [];
  const tallies = lines.reduce((s, l) => {
    if (l.variance == null) s.pending += 1;
    else if (l.variance > 0) s.over += 1;
    else if (l.variance < 0) s.short += 1;
    else s.matched += 1;
    return s;
  }, { matched: 0, over: 0, short: 0, pending: 0 });
  const reportTitle = count
    ? `${t('sc.report')} — ${namesOf(count.warehouses)} — ${gdate(count.countedOn)}`
    : t('sc.title');

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('sc.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('sc.sub')}</p>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {!count && (
        <>
          <Card>
            <div className="flex gap-2 mb-4">
              <button type="button" onClick={() => switchMode('warehouse')} className={`text-sm rounded-lg px-4 py-1.5 ${mode === 'warehouse' ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t('sc.byWarehouse')}</button>
              <button type="button" onClick={() => switchMode('branch')} className={`text-sm rounded-lg px-4 py-1.5 ${mode === 'branch' ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t('sc.byBranch')}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start">
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 text-sm font-bold mb-2">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={() => setPicked(allOn ? [] : choices.map((w) => w.id))}
                  />
                  {mode === 'branch' ? t('sc.allBranches') : t('sc.all')}
                </label>
                {mode === 'branch' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-2 text-sm border border-[#E7E5DE] rounded-lg px-2 py-1.5">
                        <input type="checkbox" checked={picked.includes(b.id)} onChange={() => toggle(b.id)} />
                        {nameOf(b)}
                      </label>
                    ))}
                  </div>
                ) : warehouseGroups.map((g) => (
                  <div key={g.branch.id} className="mb-3">
                    <p className="text-xs text-[#6C6A82] mb-1">{nameOf(g.branch)}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {g.warehouses.map((w) => (
                        <label key={w.id} className="flex items-center gap-2 text-sm border border-[#E7E5DE] rounded-lg px-2 py-1.5">
                          <input type="checkbox" checked={picked.includes(w.id)} onChange={() => toggle(w.id)} />
                          {nameOf(w)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="text-xs text-[#6C6A82] block mb-1">{t('sc.date')}</label>
                  <input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm w-full" value={countedOn} onChange={(e) => setCountedOn(e.target.value)} />
                </div>
                <button onClick={openNew} className="bg-gold text-navy font-bold rounded-lg px-5 py-2 text-sm">{t('sc.open')}</button>
              </div>
            </div>
          </Card>
          <Card>
            <h3 className="font-bold text-sm mb-3">{t('sc.saved')}</h3>
            {!saved.length ? <p className="text-sm text-[#6C6A82]">{t('sc.empty')}</p> : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[#6C6A82] text-xs">
                    <th className="text-start py-1">{t('sc.date')}</th>
                    <th className="text-start">{t('sc.savedAt')}</th>
                    <th className="text-start">{t('warehouse')}</th>
                    <th className="text-start">{t('sc.kinds')}</th>
                    <th className="text-start">{t('status')}</th>
                    <th className="text-start">{t('sc.matched')}</th>
                    <th className="text-start">{t('sc.over')}</th>
                    <th className="text-start">{t('sc.short')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {saved.map((row) => (
                    <tr key={row.id} className="border-t border-[#E7E5DE]">
                      <td className="py-1.5" dir="ltr">{gdate(row.countedOn)}</td>
                      <td dir="ltr">{stamp(row.createdAt)}</td>
                      <td>{namesOf(row.warehouses)}</td>
                      <td>{row.items}</td>
                      <td>{row.status === 'SUBMITTED' ? t('approved') : t('sc.openState')}</td>
                      <td>{row.matched}</td>
                      <td>{row.over}</td>
                      <td>{row.short}</td>
                      <td className="text-end"><button onClick={() => openSaved(row.id)} className="text-xs underline">{t('sc.openOne')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}

      {count && (
        <Card>
          <PrintBar title={reportTitle} />
          <div className="flex flex-wrap justify-between items-start gap-3 mb-3 print:hidden">
            <div>
              <h3 className="font-bold text-sm">{reportTitle}</h3>
              <p className="text-xs text-[#6C6A82] mt-1">
                {t('sc.savedAt')}: <span dir="ltr">{stamp(count.createdAt)}</span>
                {count.submittedAt ? ` · ${t('sc.approvedAt')}: ` : ''}
                {count.submittedAt ? <span dir="ltr">{stamp(count.submittedAt)}</span> : null}
              </p>
            </div>
            <div className="flex gap-2">
              {count.status !== 'SUBMITTED' && <button onClick={submit} className="text-xs bg-navy text-white rounded-lg px-4 py-1.5">{t('sc.submit')}</button>}
              <button onClick={() => { setCount(null); loadSaved(); }} className="text-xs underline text-[#6C6A82]">{t('sc.back')}</button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 text-sm">
            <div className="border border-[#E7E5DE] rounded-lg p-2"><div className="text-xs text-[#6C6A82]">{t('sc.matched')}</div><b>{tallies.matched}</b></div>
            <div className="border border-[#E7E5DE] rounded-lg p-2"><div className="text-xs text-[#6C6A82]">{t('sc.over')}</div><b className="text-[#1F7A4D]">{tallies.over}</b></div>
            <div className="border border-[#E7E5DE] rounded-lg p-2"><div className="text-xs text-[#6C6A82]">{t('sc.short')}</div><b className="text-[#C0392B]">{tallies.short}</b></div>
            <div className="border border-[#E7E5DE] rounded-lg p-2"><div className="text-xs text-[#6C6A82]">{t('sc.pending')}</div><b>{tallies.pending}</b></div>
          </div>
          {(count.sections || []).map((section) => (
            <section key={section.warehouse.id} className="mb-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h4 className="font-bold text-sm">{nameOf(section.warehouse)}</h4>
                <p className="text-xs text-[#6C6A82]">
                  {t('sc.kinds')}: <b className="text-navy">{section.items}</b>
                  <span className="mx-2">·</span>
                  {t('sc.units')}: <b className="text-navy" dir="ltr">{section.systemQty}</b>
                </p>
              </div>
              {!!section.lines.some((l) => categoryName(l)) && (
                <p className="text-xs text-[#6C6A82] mb-2">
                  {section.lines.reduce((groups, l) => {
                    const name = categoryName(l) || '—';
                    const hit = groups.find((g) => g.name === name);
                    if (hit) { hit.items += 1; hit.qty += Number(l.expectedQty); }
                    else groups.push({ name, items: 1, qty: Number(l.expectedQty) });
                    return groups;
                  }, [] as { name: string; items: number; qty: number }[]).map((g) => (
                    <span key={g.name} className="inline-block border border-[#E7E5DE] rounded-lg px-2 py-1 me-1 mb-1">
                      {g.name}: {g.items} · <span dir="ltr">{g.qty}</span>
                    </span>
                  ))}
                </p>
              )}
              {!section.lines.length ? <p className="text-sm text-[#6C6A82]">{t('sc.noneInWh')}</p> : (
                <table className="w-full text-sm table-fixed">
                  <colgroup>
                    <col className="w-[18%]" />
                    <col />
                    <col className="w-32" />
                    <col className="w-32" />
                    <col className="w-24" />
                  </colgroup>
                  <thead>
                    <tr className="text-[#6C6A82] text-xs">
                      <th className="text-start py-1 px-2">{t('sc.category')}</th>
                      <th className="text-start px-2">{t('item')}</th>
                      <th className="text-start px-2 whitespace-nowrap">{t('sc.system')}</th>
                      <th className="text-start px-2 whitespace-nowrap">{t('sc.actual')}</th>
                      <th className="text-start px-2 whitespace-nowrap">{t('sc.diff')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.lines.map((l) => (
                      <tr key={l.id} className="border-t border-[#E7E5DE]">
                        <td className="py-1.5 px-2 align-middle break-words">{categoryName(l) || '—'}</td>
                        <td className="px-2 align-middle break-words">{l.sku ? `${l.sku} — ` : ''}{itemName(l)}</td>
                        <td className="px-2 align-middle text-start whitespace-nowrap"><span dir="ltr">{Number(l.expectedQty)}</span></td>
                        <td className="px-2 align-middle text-start">
                          {count.status === 'SUBMITTED' ? <span dir="ltr">{l.countedQty == null ? '—' : Number(l.countedQty)}</span> : (
                            <input type="number" min="0" step="any" dir="ltr" defaultValue={l.countedQty ?? ''} onBlur={(e) => updateLine(l.id, e.target.value)} className="border border-[#E7E5DE] rounded p-1 text-sm w-full max-w-[6.5rem] text-start" />
                          )}
                        </td>
                        <td className={`px-2 align-middle text-start whitespace-nowrap ${l.variance == null ? '' : l.variance < 0 ? 'text-[#C0392B] font-bold' : l.variance > 0 ? 'text-[#1F7A4D] font-bold' : ''}`}>
                          <span dir="ltr">{l.variance == null ? '—' : l.variance > 0 ? `+${l.variance}` : l.variance}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
