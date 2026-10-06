import React, { useState } from 'react';
import { authApi } from '../api/client';
import { useI18n } from '../i18n';
import { AuthShell, inputCls, labelCls, btnCls } from './AuthShell';

export default function ResetPassword() {
  const { t } = useI18n();
  const params = new URLSearchParams(window.location.search);
  const email = params.get('email') || '';
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try { setMsg((await authApi.resetPassword(email, token, password)).message); setDone(true); }
    catch (err: any) { setMsg(err.message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell title={t('auth.newPassTitle')} subtitle={email}>
      {done ? (
        <>
          <p className="text-xs bg-goldsoft rounded-lg p-2 mb-3">{msg}</p>
          <a href="/login" className={`${btnCls} block text-center`}>{t('auth.login')}</a>
        </>
      ) : (
        <form onSubmit={submit}>
          <label className={labelCls}>{t('auth.newPass')}</label>
          <input required minLength={8} type="password" className={`${inputCls} mb-4`} value={password} onChange={(e) => setPassword(e.target.value)} />
          {msg && <p className="text-red-600 text-xs mb-3">{msg}</p>}
          <button disabled={busy} className={btnCls}>{busy ? '...' : t('auth.savePass')}</button>
        </form>
      )}
    </AuthShell>
  );
}
