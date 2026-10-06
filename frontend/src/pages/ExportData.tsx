import React, { useState } from 'react';
import { downloadCompanyArchive } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

export default function ExportData() {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    if (!window.confirm(t('export.ask'))) return;
    setBusy(true);
    setErr('');
    try {
      await downloadCompanyArchive();
    } catch (e: any) {
      setErr(e?.message || t('export.fail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('nav.export')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('export.sub')}</p>
      <Card>
        <p className="text-sm mb-4">{t('export.note')}</p>
        <ul className="text-sm text-[#6C6A82] mb-5 list-disc ps-5 space-y-1">
          <li>{t('export.item1')}</li>
          <li>{t('export.item2')}</li>
          <li>{t('export.item3')}</li>
        </ul>
        <button type="button" onClick={go} disabled={busy} className="bg-navy text-white rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-60">
          {busy ? t('export.working') : t('export.btn')}
        </button>
        {err ? <p className="text-sm text-red-700 mt-3">{err}</p> : null}
      </Card>
    </div>
  );
}
