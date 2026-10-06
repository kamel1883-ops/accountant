import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { AuthShell, inputCls, labelCls, btnCls } from './AuthShell';

export default function Login() {
  const { login, loading, error } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [unified, setUnified] = useState('');
  const [notice] = useState(() => {
    const n = sessionStorage.getItem('jadara_login_notice');
    if (n) sessionStorage.removeItem('jadara_login_notice');
    return n;
  });

  return (
    <AuthShell title={t('auth.login')}>
      <form onSubmit={(e) => { e.preventDefault(); login(email, password, unified); }}>
        <label className={labelCls}>{t('auth.unified')}</label>
        <input required inputMode="numeric" className={`${inputCls} mb-1`} value={unified} onChange={(e) => setUnified(e.target.value)} placeholder="7xxxxxxxxx" />
        <p className="text-xs text-[#6C6A82] mb-3">{t('auth.loginUnified')}</p>
        <label className={labelCls}>{t('email')}</label>
        <input required type="email" className={`${inputCls} mb-3`} value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className={labelCls}>{t('password')}</label>
        <input type="password" className={`${inputCls} mb-2`} value={password} onChange={(e) => setPassword(e.target.value)} />
        <a href="/forgot-password" className="text-xs underline text-[#6C6A82] block mb-4">{t('forgot')}</a>
        {(notice || error) && <p className="text-red-600 text-xs mb-3">{error || notice}</p>}
        <button disabled={loading} className={btnCls}>{loading ? t('signingIn') : t('auth.login')}</button>
      </form>
      <p className="text-center text-xs text-[#6C6A82] mt-4">{t('noAccount')} <a href="/register" className="underline font-bold text-navy">{t('createOne')}</a></p>
    </AuthShell>
  );
}
