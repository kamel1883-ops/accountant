import React, { useEffect, useState } from 'react';
import { ownerApi } from '../api/client';
import { Card, Kpi } from '../components/Layout';
import { useI18n } from '../i18n';

export default function OwnerRevenue() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  useEffect(() => { ownerApi.getRevenue().then(setData); }, []);
  const money = (n: number) => `${Number(n).toLocaleString('en-US')} ${t('currency')}`;
  const plan = (p: string) => (p === 'ADVANCED' ? t('planAdv') : p === 'BASIC' ? t('planBasic') : p);
  if (!data) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.nav.revenue')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('own.revSub')}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <Kpi label={t('own.totalClients')} value={String(data.totalTenants)} />
        <Kpi label={t('own.active')} value={String(data.activeCount)} />
        <Kpi label={t('own.inTrial')} value={String(data.trialCount)} />
        <Kpi label={t('own.booked')} value={money(data.annualRevenue)} />
        <Kpi label={t('own.received')} value={money(data.totalReceived)} />
      </div>
      <Card>
        <h3 className="font-bold text-sm mb-2">{t('own.mix')}</h3>
        <div className="flex justify-between text-sm py-1 border-b border-[#E7E5DE]"><span>{t('planBasic')}</span><b>{data.byPlan.BASIC}</b></div>
        <div className="flex justify-between text-sm py-1"><span>{t('planAdv')}</span><b>{data.byPlan.ADVANCED}</b></div>
      </Card>
      <Card>
        <h3 className="font-bold text-sm mb-2">{t('own.cashflow')}</h3>
        {data.payments.length === 0 && <p className="text-xs text-[#6C6A82]">{t('own.noPay')}</p>}
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('date')}</th><th className="text-start">{t('company')}</th><th className="text-start">{t('amount')}</th><th className="text-start">{t('own.ref')}</th></tr></thead>
          <tbody>{data.payments.map((p: any) => <tr key={p.id} className="border-t border-[#E7E5DE]"><td className="py-1.5">{new Date(p.receivedAt).toLocaleDateString('en-GB')}</td><td>{p.companyName}</td><td>{money(p.amount)}</td><td>{p.reference || '—'}</td></tr>)}</tbody>
        </table>
      </Card>
      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('company')}</th><th className="text-start">{t('own.planCol')}</th><th className="text-start">{t('own.annualVal')}</th><th className="text-start">{t('status')}</th></tr></thead>
          <tbody>
            {data.tenants.map((row: any, i: number) => (
              <tr key={i} className="border-t border-[#E7E5DE]"><td className="py-1.5">{row.companyName}</td><td>{plan(row.plan)}</td><td>{row.status === 'ACTIVE' ? money(row.priceAtSignup) : '—'}</td><td>{row.status === 'ACTIVE' ? t('own.subWord') : row.status === 'TRIAL' ? t('own.trial') : (t(`own.st.${row.status}`) === `own.st.${row.status}` ? row.status : t(`own.st.${row.status}`))}</td></tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
