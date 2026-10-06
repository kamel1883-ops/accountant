import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { CHART, CompareBars, Donut, Trend, type MonthPoint } from '../components/dashCharts';
import { NavIcon } from '../components/navIcons';
import { startOfYear, today } from '../components/fin';
import { gdate, money, useI18n } from '../i18n';

type Dash = {
  from: string;
  to: string;
  netSales: number;
  purchases: number;
  expenses: number;
  netProfit: number;
  cash: number;
  receivables: number;
  payables: number;
  outputVat: number;
  inputVat: number;
  months: MonthPoint[];
  expensesTop: { nameAr: string; nameEn: string; amount: number }[];
  counts: { salesInvoices: number; entries: number; lowStock: number };
};

const TONES: Record<string, string> = {
  sales: 'bg-[#1D4E89]',
  buy: 'bg-[#C4A35A]',
  exp: 'bg-[#C0392B]',
  profit: 'bg-[#1F7A4D]',
  cash: 'bg-[#1E6B4F]',
  ar: 'bg-[#2E6B8A]',
  ap: 'bg-[#8A6A2F]',
  vat: 'bg-[#3D4C73]',
};

function Tile({ label, value, unit, tone, icon }: { label: string; value: string; unit?: string; tone: string; icon: string }) {
  return (
    <div className={`${TONES[tone]} text-white rounded-2xl px-4 py-3.5 shadow-sm min-w-0`}>
      <div className="flex items-center gap-2 text-white/90">
        <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0"><NavIcon name={icon} size={16} /></span>
        <span className="text-sm leading-snug">{label}</span>
      </div>
      <div className="mt-3 whitespace-nowrap">
        <span dir="ltr" className="text-xl font-bold font-mono tracking-tight">{value}</span>
        {unit ? <span className="text-xs text-white/80 ms-1.5">{unit}</span> : null}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#E7E8EC] rounded-2xl p-4 md:p-5 shadow-sm min-w-0">
      <h3 className="font-bold text-navy mb-3">{title}</h3>
      {children}
    </section>
  );
}

export default function Dashboard() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<Dash | null>(null);
  const [h, setH] = useState<any>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getDashboard(startOfYear(), today())
      .then(setD)
      .catch((e) => setErr(e.message || t('dash.fail')));
    api.getHealth().then(setH).catch(() => setH(null));
  }, []);

  if (err) return <p className="text-sm text-red-700">{err}</p>;
  if (!d) return <p className="text-sm text-[#6C6A82]">{t('loading')}</p>;

  const months = d.months || [];
  const quiet = !months.some((m) => m.sales || m.purchases || m.expenses || m.profit);
  const vat = Number(d.outputVat || 0) - Number(d.inputVat || 0);
  const cur = t('currency');
  const net = Number(d.netProfit) || 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-xl font-bold">{t('nav.dash')}</h2>
          <p className="text-sm text-[#6C6A82]">{t('dash.sub')}</p>
        </div>
        <div className="text-sm font-mono text-navy bg-white border border-[#E7E8EC] rounded-xl px-3 py-1.5 shadow-sm" dir="ltr">
          {gdate(d.from)} — {gdate(d.to)}
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3">
        <Tile label={t('st.netSales')} value={money(d.netSales)} unit={cur} tone="sales" icon="sales" />
        <Tile label={t('dash.purchases')} value={money(d.purchases)} unit={cur} tone="buy" icon="purchases" />
        <Tile label={t('st.opex')} value={money(d.expenses)} unit={cur} tone="exp" icon="reports" />
        <Tile label={net >= 0 ? t('st.netProfit') : t('st.netLoss')} value={money(Math.abs(net))} unit={cur} tone="profit" icon="profit" />
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <Tile label={t('st.closingCash')} value={money(d.cash)} unit={cur} tone="cash" icon="cash" />
        <Tile label={t('dash.ar')} value={money(d.receivables)} unit={cur} tone="ar" icon="ar" />
        <Tile label={t('dash.ap')} value={money(d.payables)} unit={cur} tone="ap" icon="ap" />
        <Tile label={t('dash.vatNet')} value={money(vat)} unit={cur} tone="vat" icon="vat" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-3 mb-3">
        <div className="xl:col-span-2">
          <Panel title={t('dash.donut')}>
            <Donut slices={[
              { label: t('dash.sales'), value: Number(d.netSales) || 0, color: CHART.BLUE },
              { label: t('dash.purchases'), value: Number(d.purchases) || 0, color: CHART.GOLD },
              { label: t('dash.expenses'), value: Number(d.expenses) || 0, color: CHART.RED },
            ]} />
          </Panel>
        </div>
        <div className="xl:col-span-3">
          <Panel title={t('dash.compare')}>
            <CompareBars rtl={lang === 'ar'} items={[
              { label: t('dash.sales'), value: Number(d.netSales) || 0, color: CHART.BLUE },
              { label: t('dash.purchases'), value: Number(d.purchases) || 0, color: CHART.GOLD },
              { label: t('dash.expenses'), value: Number(d.expenses) || 0, color: CHART.RED },
              { label: net >= 0 ? t('st.netProfit') : t('st.netLoss'), value: net, color: CHART.GREEN },
            ]} />
          </Panel>
        </div>
      </div>

      <Panel title={t('dash.area')}>
        {quiet ? <p className="text-sm text-[#6C6A82]">{t('dash.empty')}</p> : <Trend months={months} lang={lang} label={t('dash.area')} />}
      </Panel>

      {h && (
        <div className={`mt-3 border rounded-2xl px-4 py-3 text-sm ${h.healthy ? 'bg-white border-[#E7E8EC] text-emerald-800' : 'bg-white border-red-200 text-red-700'}`}>
          <div className="font-bold">{h.healthy ? t('health.ok') : `${(h.issues || []).filter((i: any) => i.level === 'error').length} — ${t('health.errors')}`}</div>
        </div>
      )}
    </div>
  );
}
