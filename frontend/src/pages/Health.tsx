import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { money, PrintHeader } from '../components/fin';
import { useI18n } from '../i18n';

export default function Health() {
  const { t } = useI18n();
  const [d, setD] = useState<any>(null);
  const load = () => { setD(null); api.getHealth().then(setD).catch(() => setD({ issues: [], totals: {}, accountingEquation: { assets: 0, liab: 0, eq: 0 } })); };
  useEffect(load, []);
  if (!d) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;

  const issues = Array.isArray(d.issues) ? d.issues : [];
  const errors = issues.filter((i: any) => i.level === 'error');
  const warns = issues.filter((i: any) => i.level === 'warn');
  const eq = d.accountingEquation || { assets: 0, liab: 0, eq: 0 };
  const totals = d.totals || {};

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('health.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('health.sub')}</p>
      <PrintHeader title={t('health.title')} />

      <div className={`rounded-xl p-4 mb-4 font-bold ${d.healthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
        {d.healthy ? t('health.ok') : `✕ ${errors.length} — ${t('health.errors')}`}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {[[t('health.entries'), totals.entries], [t('health.accountsCount'), totals.accounts], [t('health.totalDebit'), money(totals.totalDebit)], [t('health.totalCredit'), money(totals.totalCredit)]].map(([l, v]: any) => (
          <div key={l} className="bg-white border border-[#E7E5DE] rounded-xl p-4"><div className="text-xs text-[#6C6A82]">{l}</div><div className="font-bold text-lg" dir="ltr">{v}</div></div>
        ))}
      </div>

      <Card>
        <h3 className="font-bold text-sm mb-2">{t('health.equation')}</h3>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <span>{t('type.ASSET')} <b dir="ltr" className="font-mono">{money(eq.assets)}</b></span><span>=</span>
          <span>{t('type.LIABILITY')} <b dir="ltr" className="font-mono">{money(eq.liab)}</b></span><span>+</span>
          <span>{t('type.EQUITY')} <b dir="ltr" className="font-mono">{money(eq.eq)}</b></span>
          <span className={`font-bold ${Math.abs(eq.assets - (eq.liab + eq.eq)) < 0.01 ? 'text-green-700' : 'text-red-600'}`}>
            {Math.abs(eq.assets - (eq.liab + eq.eq)) < 0.01 ? `✓ ${t('balanced')}` : `✕ ${t('difference')} ${money(eq.assets - (eq.liab + eq.eq))}`}
          </span>
        </div>
      </Card>

      {errors.length > 0 && (
        <Card className="!border-red-300">
          <h3 className="font-bold text-sm mb-2 text-red-700">{t('health.errors')} ({errors.length})</h3>
          <ul className="text-sm space-y-1">{errors.map((i: any, x: number) => <li key={x} className="text-red-700">• {i.message}</li>)}</ul>
        </Card>
      )}
      {warns.length > 0 && (
        <Card className="!border-[#C6A15B]">
          <h3 className="font-bold text-sm mb-2">{t('health.warnings')} ({warns.length})</h3>
          <ul className="text-sm space-y-1 text-[#6C6A82]">{warns.map((i: any, x: number) => <li key={x}>• {i.message}</li>)}</ul>
        </Card>
      )}
      <button onClick={load} className="border border-[#E7E5DE] rounded-lg px-4 py-2 text-sm print:hidden">{t('health.recheck')}</button>
    </div>
  );
}
