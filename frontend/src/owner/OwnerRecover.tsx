import React, { useState } from 'react';
import { ownerApi } from '../api/client';
import { OWNER_PATH } from '../config';
import { LangToggle, useI18n } from '../i18n';

const inp = 'w-full border border-[#E7E5DE] rounded-lg p-2.5 mb-3 text-sm';

export default function OwnerRecover({ mode }: { mode: 'forgot' | 'reset' }) {
  const { t } = useI18n();
  const q = new URLSearchParams(window.location.search);
  const [email, setEmail] = useState(q.get('email') || '');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = mode === 'forgot' ? await ownerApi.forgotPassword(email) : await ownerApi.resetPassword(email, q.get('token') || '', password);
      setMsg(r.message); setDone(true);
    } catch (err: any) { setMsg(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white border border-[#E7E5DE] rounded-2xl p-8 w-full max-w-sm">
        <div className="flex justify-end mb-2"><LangToggle light /></div>
        <h1 className="font-bold text-lg text-center mb-1">{mode === 'forgot' ? t('own.forgotTitle') : t('auth.newPassTitle')}</h1>
        <p className="text-xs text-[#6C6A82] text-center mb-5">{mode === 'forgot' ? t('own.forgotSub') : t('own.resetSub')}</p>
        {mode === 'forgot' && <input required type="email" className={inp} placeholder={t('email')} value={email} onChange={(e) => setEmail(e.target.value)} />}
        {mode === 'reset' && <input required minLength={10} type="password" className={inp} placeholder={t('own.newPassPh')} value={password} onChange={(e) => setPassword(e.target.value)} />}
        {msg && <p className={`text-xs mb-3 ${done ? 'bg-goldsoft rounded-lg p-2' : 'text-red-600'}`}>{msg}</p>}
        {!(done && mode === 'reset') && <button disabled={busy} className="w-full bg-navy text-white font-bold rounded-lg py-2.5 text-sm">{busy ? '...' : mode === 'forgot' ? t('own.send') : t('save')}</button>}
        <a href={OWNER_PATH} className="text-xs underline text-[#6C6A82] block text-center mt-4">{t('backLogin')}</a>
      </form>
    </div>
  );
}
