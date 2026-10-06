import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { ExcelButton, PrintHeader } from '../components/fin';
import { useI18n, money } from '../i18n';

export default function VatReturn() {
  const { t } = useI18n();
  const [year] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [data, setData] = useState<any>(null);

  useEffect(() => { api.getVatReturn(year, quarter).then(setData); }, [year, quarter]);

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('vat.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5 print:hidden">{t('vat.sub')}</p>
      <div className="mb-4 print:hidden">
        <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
          <option value={1}>{t('vat.q1')}</option><option value={2}>{t('vat.q2')}</option>
          <option value={3}>{t('vat.q3')}</option><option value={4}>{t('vat.q4')}</option>
        </select>
      </div>
      {data && (
        <Card>
          <PrintHeader title={t('vat.title')} period={`${t('vat.year')} ${data.year} — ${t('vat.quarter')} ${data.quarter}`} />
          <h3 className="font-bold mb-1 print:hidden">{t('vat.title')}</h3>
          <p className="text-xs text-[#6C6A82] mb-4 print:hidden">{t('vat.year')} {data.year} — {t('vat.quarter')} {data.quarter}</p>
          <table className="w-full text-sm">
            <thead><tr className="text-[#6C6A82] text-xs"><th className="text-right py-1">{t('vat.line')}</th><th className="text-right">{t('vat.base')}</th><th className="text-right">{t('vat')}</th></tr></thead>
            <tbody>
              <tr className="border-t border-[#E7E5DE]"><td className="py-1.5">{t('vat.outputs')}</td><td dir="ltr">{money(data.outputBase)}</td><td dir="ltr">{money(data.outputVat)}</td></tr>
              <tr className="border-t border-[#E7E5DE]"><td className="py-1.5">{t('vat.inputs')}</td><td dir="ltr">{money(data.inputBase)}</td><td dir="ltr">{money(data.inputVat)}</td></tr>
            </tbody>
            <tfoot><tr className="border-t border-[#E7E5DE] font-bold"><td colSpan={2} className="py-2">{data.status}</td><td dir="ltr">{money(Math.abs(data.netVat))} {t('currency')}</td></tr></tfoot>
          </table>
          <div className="flex gap-2 mt-4 print:hidden">
            <button onClick={() => window.print()} className="border border-[#E7E5DE] rounded-lg px-4 py-2 text-sm font-bold">🖨 {t('print')}</button>
            <ExcelButton title={t('vat.title')} />
          </div>
        </Card>
      )}
    </div>
  );
}
