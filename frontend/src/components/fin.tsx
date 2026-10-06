import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n, gdate, money } from '../i18n';
import { downloadReportExcel } from '../utils/excelDownload';

export { money, gdate };
export const inp = 'border border-[#E7E5DE] rounded-lg p-2 text-sm w-full';
export const lbl = 'text-xs text-[#6C6A82] block mb-1';

export const ymd = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
export const startOfYear = () => ymd(new Date(new Date().getFullYear(), 0, 1));
export const startOfMonth = () => ymd(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
export const today = () => ymd(new Date());

export type CompanyPrint = { companyName: string; unifiedNumber: string; logoDataUrl?: string | null };
let companyCache: CompanyPrint | null = null;
const companyListeners = new Set<(c: CompanyPrint | null) => void>();

export function rememberCompany(c: CompanyPrint | null) {
  companyCache = c;
  companyListeners.forEach((fn) => fn(c));
}

function useCompany() {
  const [co, setCo] = useState(companyCache);
  useEffect(() => {
    companyListeners.add(setCo);
    if (companyCache) setCo(companyCache);
    else api.getCompany().then((c) => rememberCompany(c)).catch(() => rememberCompany(null));
    return () => { companyListeners.delete(setCo); };
  }, []);
  return co;
}

/** جداره في يمين الترويسة. اسم المنشأة ورقمها الموحّد وشعارها في اليسار. */
export function PrintHeader({ title, period }: { title: string; period?: string }) {
  const { t } = useI18n();
  const co = useCompany();
  return (
    <div className="hidden print:block mb-3">
      <div className="flex justify-between items-start gap-3 mb-2">
        <div className="font-bold text-base">{title}</div>
        <div className="text-xs shrink-0 text-end">
          <div>{t('date')}: {gdate(new Date())}</div>
          {period && <div>{period}</div>}
        </div>
      </div>
      <div className="print-brand-row pb-2 border-b-2 border-navy" dir="ltr">
        <div className="flex items-center gap-2 min-w-0" dir="ltr">
          {co?.logoDataUrl ? <img src={co.logoDataUrl} alt="" className="h-11 w-auto max-w-[120px] object-contain shrink-0" /> : null}
          <div className="text-xs text-start">
            {co?.companyName ? <div className="font-bold text-sm text-[#1E1B33]">{co.companyName}</div> : null}
            {co?.unifiedNumber ? <div className="text-[#6C6A82]">{t('print.unified')}: <span dir="ltr">{co.unifiedNumber}</span></div> : null}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0" dir="ltr">
          <div className="font-bold text-base leading-tight">{t('brand')}</div>
          <span className="print-logo w-11 h-11 rounded-xl border-[1.5px] border-[#C6A15B] bg-navy flex items-center justify-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#C6A15B" strokeWidth="1.6" aria-hidden>
              <path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z" />
              <path d="M6 20h12" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

export function ExcelButton({ title, size = 'sm' }: { title?: string; size?: 'sm' | 'xs' }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const cls = size === 'xs'
    ? 'text-xs border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold'
    : 'text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold shrink-0';
  async function go() {
    const name = title || document.querySelector('main h2')?.textContent?.trim() || t('nav.reports');
    setBusy(true);
    try {
      await downloadReportExcel(name);
    } catch (e: any) {
      window.alert(e?.message === 'empty' ? t('excel.empty') : t('excel.fail'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={go} disabled={busy} className={`${cls} disabled:opacity-60`}>
      {busy ? t('excel.working') : t('excel.btn')}
    </button>
  );
}

export function PrintBar({ title, excel = true }: { title: string; excel?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <div className="flex justify-end gap-2 mb-2 print:hidden">
        <button type="button" onClick={() => window.print()} className="text-xs border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold">🖨 {t('print')}</button>
        {excel ? <ExcelButton title={title} size="xs" /> : null}
      </div>
      <PrintHeader title={title} />
    </>
  );
}

/** شريط اختيار الفترة مع اختصارات جاهزة وزر طباعة */
export function PeriodBar({ from, to, setFrom, setTo, onApply, asOfOnly }: any) {
  const { t } = useI18n();
  const q = (f: string, x: string) => { setFrom(f); setTo(x); setTimeout(onApply, 0); };
  const m = (off: number) => {
    const d = new Date(); const s = new Date(d.getFullYear(), d.getMonth() + off, 1); const e = new Date(d.getFullYear(), d.getMonth() + off + 1, 0);
    return [ymd(s), ymd(e)] as [string, string];
  };
  return (
    <div className="flex flex-wrap gap-2 items-end mb-4 print:hidden">
      {!asOfOnly && <div><label className={lbl}>{t('from')}</label><input type="date" className={inp} value={from} onChange={(e) => setFrom(e.target.value)} /></div>}
      <div><label className={lbl}>{asOfOnly ? t('asOf') : t('to')}</label><input type="date" className={inp} value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <button onClick={onApply} className="bg-navy text-white rounded-lg px-4 py-2 text-sm">{t('show')}</button>
      {!asOfOnly && (
        <div className="flex gap-1 flex-wrap">
          <button onClick={() => q(...m(0))} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-2">{t('thisMonth')}</button>
          <button onClick={() => q(...m(-1))} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-2">{t('lastMonth')}</button>
          <button onClick={() => q(startOfYear(), today())} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-2">{t('thisYear')}</button>
        </div>
      )}
      <button onClick={() => window.print()} className="text-xs border border-[#E7E5DE] rounded-lg px-4 py-2 ms-auto font-bold">🖨 {t('print')}</button>
      <ExcelButton size="xs" />
    </div>
  );
}

export function Line({ label, value, bold, indent, top, big }: any) {
  return (
    <div className={`flex justify-between py-1.5 ${top ? 'border-t-2 border-navy mt-1 pt-2' : 'border-b border-[#E7E5DE]'} ${bold ? 'font-bold' : ''} ${big ? 'text-base' : 'text-sm'}`}>
      <span style={{ paddingInlineStart: indent ? 16 : 0 }} className={`min-w-0 ${indent ? 'text-[#6C6A82]' : ''}`}>{label}</span>
      <span dir="ltr" className="font-mono shrink-0 whitespace-nowrap ps-2">{money(value)}</span>
    </div>
  );
}

export function Items({ items }: { items?: { code: string; nameAr: string; nameEn?: string; amount: number }[] }) {
  const { lang } = useI18n();
  const list = Array.isArray(items) ? items : [];
  return <>{list.map((i) => <Line key={i.code} label={`${i.code} — ${lang === 'en' ? i.nameEn || i.nameAr : i.nameAr}`} value={i.amount} indent />)}</>;
}
