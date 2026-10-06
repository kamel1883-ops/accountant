import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';

export function CostCenterSelect({ value, onChange, centers }: { value: string; onChange: (id: string, center?: any) => void; centers?: any[] }) {
  const { t, lang } = useI18n();
  const [rows, setRows] = useState<any[]>(centers || []);
  useEffect(() => {
    if (centers) { setRows(centers); return; }
    api.getCostCenters().then((d) => setRows(Array.isArray(d) ? d.filter((c) => c.status === 'ACTIVE') : [])).catch(() => setRows([]));
  }, [centers]);
  if (!rows.length) return null;
  const nm = (c: any) => (lang === 'en' ? c.nameEn || c.nameAr : c.nameAr);
  return (
    <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={value} onChange={(e) => onChange(e.target.value, rows.find((c) => c.id === e.target.value))}>
      <option value="">{t('cc.pick')}</option>
      {rows.map((c) => <option key={c.id} value={c.id}>{c.code} — {nm(c)}</option>)}
    </select>
  );
}
