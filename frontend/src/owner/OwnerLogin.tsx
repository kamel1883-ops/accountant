import React, { useState } from 'react';
import { useOwnerAuth } from '../context/OwnerAuthContext';
import { OWNER_PATH } from '../config';
import { LangToggle, useI18n } from '../i18n';

export default function OwnerLogin() {
  const { login, loading, error } = useOwnerAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={(e) => { e.preventDefault(); login(email, password); }} className="bg-white border border-[#E7E5DE] rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-end mb-2"><LangToggle light /></div>
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <span className="w-[46px] h-[46px] rounded-xl border-[1.5px] border-[#C6A15B] bg-[#151340] flex items-center justify-center shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C6A15B" strokeWidth="1.6" aria-hidden><path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z" /><path d="M6 20h12" /></svg>
            </span>
            <div className="text-start">
              <h1 className="font-bold text-[22px] leading-tight">{t('brand')}</h1>
              <p className="text-sm text-[#C6A15B] leading-tight">{t('ownerPortal')}</p>
            </div>
          </div>
        </div>
        <label className="text-xs text-[#6C6A82] block mb-1">{t('email')}</label>
        <input type="email" className="w-full border border-[#E7E5DE] rounded-lg p-2.5 mb-3 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="text-xs text-[#6C6A82] block mb-1">{t('password')}</label>
        <input type="password" className="w-full border border-[#E7E5DE] rounded-lg p-2.5 mb-2 text-sm" value={password} onChange={(e) => setPassword(e.target.value)} />
        <a href={`${OWNER_PATH}/forgot`} className="text-xs underline text-[#6C6A82] block mb-4">{t('forgot')}</a>
        {error && <p className="text-red-600 text-xs mb-3">{error}</p>}
        <button disabled={loading} className="w-full bg-navy text-white font-bold rounded-lg py-2.5 text-sm">{loading ? '...' : t('own.signIn')}</button>
      </form>
    </div>
  );
}
