import React, { useEffect, useState } from 'react';
import { ownerApi } from '../api/client';
import { Card, Kpi } from '../components/Layout';
import { useI18n } from '../i18n';

const fmt = (n: number) => Number(n).toLocaleString('en-US');
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '—');

export default function OwnerOverview({ go }: { go: (k: string) => void }) {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  useEffect(() => { ownerApi.getOverview().then(setD); }, []);
  const plan = (p: string) => (p === 'ADVANCED' ? t('planAdv') : t('planBasic'));
  if (!d) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;

  const table = (title: string, rows: any[], empty: string, tone?: 'warn') => (
    <Card className={tone === 'warn' ? '!border-[#C6A15B]' : ''}>
      <h3 className="font-bold text-sm mb-2">{title} <span className="text-[#6C6A82] font-normal">({rows.length})</span></h3>
      {rows.length === 0 ? <p className="text-xs text-[#6C6A82]">{empty}</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[28rem]">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('company')}</th><th className="text-start">{t('auth.plan')}</th><th className="text-start">{t('own.ends')}</th><th className="text-start">{t('own.left')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenantId} className="border-t border-[#E7E5DE]">
                <td className="py-1.5">{r.companyName}</td><td>{plan(r.plan)}</td><td>{date(r.endDate)}</td>
                <td className={r.daysLeft !== null && r.daysLeft <= 7 ? 'text-red-600 font-bold' : ''}>{r.daysLeft === null ? '—' : r.daysLeft < 0 ? t('ended') : `${r.daysLeft} ${t('days')}`}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Card>
  );

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.nav.overview')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('own.overviewSub')}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <button onClick={() => go('leads')} className="text-start"><Kpi label={t('own.pending')} value={String(d.counts.pendingLeads)} /></button>
        <Kpi label={t('own.onTrial')} value={String(d.counts.trial)} />
        <Kpi label={t('own.active')} value={String(d.counts.active)} />
        <Kpi label={t('own.soon60')} value={String(d.counts.expiringSoon)} />
        <Kpi label={t('own.expired')} value={String(d.counts.expired)} />
        <Kpi label={t('own.annual')} value={`${fmt(d.annualRevenue)} ${t('currency')}`} />
      </div>
      {table(t('own.soonTitle'), d.expiringSoon, t('own.soonEmpty'), 'warn')}
      {table(t('own.onTrial'), d.trial, t('own.trialEmpty'))}
      {table(t('own.activeTitle'), d.active, t('own.activeEmpty'))}
      {table(t('own.expiredTitle'), d.expired, t('own.expiredEmpty'))}
      <p className="text-xs text-[#6C6A82]">{t('own.hint')}</p>
    </div>
  );
}
