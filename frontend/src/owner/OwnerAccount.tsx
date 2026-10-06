import React, { useState } from 'react';
import { ownerApi } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

export default function OwnerAccount() {
  const { t } = useI18n();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setMsg('');
    if (newPassword !== confirm) { setErr(t('own.mismatch')); return; }
    setBusy(true);
    try {
      const r = await ownerApi.changePassword(currentPassword, newPassword);
      setMsg(r.message);
      setCurrent(''); setNew(''); setConfirm('');
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.accountTitle')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">{t('own.accountSub')}</p>
      <Card className="max-w-md">
        <form onSubmit={submit} className="grid gap-2">
          <label className="text-xs text-[#6C6A82]">{t('own.current')}</label>
          <input type="password" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
          <label className="text-xs text-[#6C6A82]">{t('own.new10')}</label>
          <input type="password" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={newPassword} onChange={(e) => setNew(e.target.value)} />
          <label className="text-xs text-[#6C6A82]">{t('own.confirmNew')}</label>
          <input type="password" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {err && <p className="text-red-600 text-xs">{err}</p>}
          {msg && <p className="text-green-700 text-xs">{msg}</p>}
          <button disabled={busy} className="bg-navy text-white rounded-lg py-2 text-sm mt-1">{busy ? '...' : t('auth.savePass')}</button>
        </form>
      </Card>
    </div>
  );
}
