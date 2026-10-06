import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { PeriodBar, PrintHeader, money, gdate, startOfMonth, today } from '../components/fin';
import { useI18n } from '../i18n';

export default function TrialBalance() {
  const { t, lang } = useI18n();
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [level, setLevel] = useState('detail');
  const [zero, setZero] = useState('0');
  const [d, setD] = useState<any>(null);

  const load = () => api.getTrialBalanceReport({ from, to, level, zero }).then(setD).catch(() => setD({ rows: [], totals: {} }));
  useEffect(() => { load(); }, [level, zero]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('trial.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('trial.sub')}</p>
      <div className="flex gap-2 flex-wrap items-end print:hidden">
        <PeriodBar from={from} to={to} setFrom={setFrom} setTo={setTo} onApply={load} />
      </div>
      <div className="flex gap-2 mb-3 print:hidden">
        <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
          <option value="detail">{t('trial.detail')}</option><option value="summary">{t('trial.summary')}</option>
        </select>
        <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={zero} onChange={(e) => setZero(e.target.value)}>
          <option value="0">{t('trial.hideZero')}</option><option value="1">{t('trial.showAll')}</option>
        </select>
      </div>

      {!d ? <p className="text-sm text-[#6C6A82]">{t('loading')}</p> : (
        <Card>
          <PrintHeader title={t('trial.title')} period={`${t('from')} ${gdate(d.from)} ${t('to')} ${gdate(d.to)}`} />
          <p className="text-xs text-[#6C6A82] mb-2 print:hidden">{t('from')} {gdate(d.from)} {t('to')} {gdate(d.to)}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <colgroup>
                <col style={{ width: '34%' }} />
                <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} /><col style={{ width: '11%' }} />
              </colgroup>
              <thead>
                <tr className="text-[#6C6A82] text-xs">
                  <th className="text-start py-1">{t('account')}</th>
                  <th className="text-start" colSpan={2}>{t('trial.opening')}</th>
                  <th className="text-start" colSpan={2}>{t('trial.movement')}</th>
                  <th className="text-start" colSpan={2}>{t('trial.closing')}</th>
                </tr>
                <tr className="text-[#6C6A82] text-[11px]"><th></th>{[0,1,2].map((i) => <React.Fragment key={i}><th className="text-start">{t('debit')}</th><th className="text-start">{t('credit')}</th></React.Fragment>)}</tr>
              </thead>
              <tbody>
                {(Array.isArray(d.rows) ? d.rows : []).map((r: any) => (
                  <tr key={r.code} className="border-t border-[#E7E5DE]">
                    <td className="py-1.5">{r.code} — {lang === 'en' ? r.nameEn || r.nameAr : r.nameAr}</td>
                    <td dir="ltr" className="font-mono">{r.openingDebit ? money(r.openingDebit) : '—'}</td>
                    <td dir="ltr" className="font-mono">{r.openingCredit ? money(r.openingCredit) : '—'}</td>
                    <td dir="ltr" className="font-mono">{r.debit ? money(r.debit) : '—'}</td>
                    <td dir="ltr" className="font-mono">{r.credit ? money(r.credit) : '—'}</td>
                    <td dir="ltr" className="font-mono font-bold">{r.closingDebit ? money(r.closingDebit) : '—'}</td>
                    <td dir="ltr" className="font-mono font-bold">{r.closingCredit ? money(r.closingCredit) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-navy font-bold">
                  <td className="py-2">{t('total')}</td>
                  <td dir="ltr" className="font-mono">{money(d.totals?.openingDebit)}</td><td dir="ltr" className="font-mono">{money(d.totals?.openingCredit)}</td>
                  <td dir="ltr" className="font-mono">{money(d.totals?.debit)}</td><td dir="ltr" className="font-mono">{money(d.totals?.credit)}</td>
                  <td dir="ltr" className="font-mono">{money(d.totals?.closingDebit)}</td><td dir="ltr" className="font-mono">{money(d.totals?.closingCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={`mt-3 text-sm font-bold ${d.balanced ? 'text-green-700' : 'text-red-600'}`}>
            {d.balanced ? `✓ ${t('balanced')}` : `✕ ${t('notBalanced')}`}
          </p>
        </Card>
      )}
    </div>
  );
}
