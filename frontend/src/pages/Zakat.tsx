import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, Kpi } from '../components/Layout';
import { ExcelButton, PrintHeader } from '../components/fin';
import { useI18n, money } from '../i18n';

export default function Zakat() {
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    api.getZakat().then(setData).catch(() => setData({ inputs: {}, additions: 0, zakatBase: 0, zakatDueHijri: 0, zakatDueGregorian: 0 }));
  }, []);
  if (!data) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;

  const inp = data.inputs || {};
  const rows: [string, number][] = [
    [t('zakat.capital'), inp.capital],
    [t('zakat.reserves'), inp.reserves],
    [t('zakat.retained'), inp.retained],
    [t('zakat.loans'), inp.loans],
    [t('zakat.netProfit'), inp.netProfit],
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 print:hidden">
        <h2 className="text-xl font-bold">{t('zakat.title')}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold shrink-0">🖨 {t('print')}</button>
          <ExcelButton title={t('zakat.title')} />
        </div>
      </div>
      <p className="text-sm text-[#6C6A82] mb-5 print:hidden">{t('zakat.sub')}</p>
      <PrintHeader title={t('zakat.title')} />
      <Card>
        <h3 className="font-bold text-sm mb-2">{t('zakat.additions')}</h3>
        {rows.map(([label, val]) => (
          <div key={label} className="flex justify-between text-sm py-1 border-b border-[#E7E5DE]">
            <span className="min-w-0">{label}</span><b dir="ltr" className="shrink-0 whitespace-nowrap">{money(Number(val))}</b>
          </div>
        ))}
        <div className="flex justify-between text-sm py-2 font-bold"><span>{t('zakat.totalAdd')}</span><span dir="ltr" className="shrink-0 whitespace-nowrap">{money(data.additions)}</span></div>
        <h3 className="font-bold text-sm mt-3 mb-2">{t('zakat.deductions')}</h3>
        <div className="flex justify-between text-sm py-1 border-b border-[#E7E5DE]"><span>{t('zakat.fixed')}</span><b dir="ltr" className="shrink-0 whitespace-nowrap">{money(Number(inp.fixedAssetsNet))}</b></div>
        <div className="flex justify-between text-sm py-2 font-bold"><span>{t('zakat.base')}</span><span dir="ltr" className="shrink-0 whitespace-nowrap">{money(data.zakatBase)}</span></div>
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Kpi label={t('zakat.hijri')} value={`${money(data.zakatDueHijri)} ${t('currency')}`} />
        <Kpi label={t('zakat.greg')} value={`${money(data.zakatDueGregorian)} ${t('currency')}`} />
      </div>
    </div>
  );
}
