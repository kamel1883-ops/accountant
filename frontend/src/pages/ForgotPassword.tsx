import React, { useState } from 'react';
import { authApi } from '../api/client';
import { useI18n } from '../i18n';
import { AuthShell, inputCls, labelCls, btnCls } from './AuthShell';

export default function ForgotPassword() {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [unified, setUnified] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await authApi.forgotPassword(email, unified);
      setMsg(r.message);
    } catch (err: any) { setMsg(err.message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotSub')}>
      <form onSubmit={submit}>
        <label className={labelCls}>{t('auth.unified')}</label>
        <input required inputMode="numeric" className={`${inputCls} mb-1`} value={unified} onChange={(e) => setUnified(e.target.value)} placeholder="7xxxxxxxxx" />
        <p className="text-xs text-[#6C6A82] mb-3">{t('auth.loginUnified')}</p>
        <label className={labelCls}>{t('email')}</label>
        <input required type="email" className={`${inputCls} mb-3`} value={email} onChange={(e) => setEmail(e.target.value)} />
        {msg && <p className="text-xs bg-goldsoft rounded-lg p-2 mb-3">{msg}</p>}
        <button disabled={busy} className={btnCls}>{busy ? '...' : t('auth.sendLink')}</button>
      </form>
      <p className="text-center text-xs mt-4"><a href="/login" className="underline text-[#6C6A82]">{t('backLogin')}</a></p>
    </AuthShell>
  );
}
