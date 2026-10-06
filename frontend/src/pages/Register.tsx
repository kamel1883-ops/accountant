import React, { useState } from 'react';
import { customerApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { AuthShell, inputCls, labelCls, btnCls } from './AuthShell';

const empty = { discountCode: '', companyName: '', unifiedNumber: '', commercialRegister: '', activity: '', city: '', contactName: '', phone: '', email: '', password: '', plan: 'BASIC', requestType: 'subscribe' };

export default function Register() {
  const { setCustomerSession } = useAuth();
  const { t } = useI18n();
  const [f, setF] = useState<any>(() => {
    const q = new URLSearchParams(window.location.search);
    return {
      ...empty,
      plan: q.get('plan') === 'ADVANCED' ? 'ADVANCED' : 'BASIC',
      requestType: q.get('request') === 'trial' ? 'trial' : 'subscribe',
    };
  });
  const [crImage, setCrImage] = useState('');
  const [crFilename, setCrFilename] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function onCr(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) { setCrImage(''); setCrFilename(''); return; }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setError(t('auth.crType')); return; }
    if (file.size > 4 * 1024 * 1024) { setError(t('auth.crType')); return; }
    const reader = new FileReader();
    reader.onload = () => { setCrImage(String(reader.result || '')); setCrFilename(file.name); setError(''); };
    reader.readAsDataURL(file);
  }

  async function checkCode() {
    if (!f.discountCode.trim()) return;
    try {
      const r = await customerApi.validateCode(f.discountCode, f.plan);
      setCodeMsg({ ok: true, text: `${t('auth.codeOk')} ${r.code}: ${r.label} — ${t('auth.due')} ${Number(r.total).toLocaleString('en-US')} ${t('currency')}` });
    } catch (e: any) { setCodeMsg({ ok: false, text: e.message }); }
  }
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const unified = String(f.unifiedNumber || '').replace(/\D/g, '');
    if (!/^7\d{9}$/.test(unified)) { setError(t('auth.unifiedBad')); return; }
    if (!crImage) { setError(t('auth.crMissing')); return; }
    setBusy(true);
    try {
      const res = await customerApi.register({ ...f, unifiedNumber: unified, crImage, crFilename });
      setCustomerSession(res.token, res.customer);
      window.location.href = '/account';
    } catch (err: any) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <AuthShell wide title={t('auth.register')} subtitle={t('auth.registerSub')}>
      <form onSubmit={submit} className="grid grid-cols-2 gap-3">
        <div><label className={labelCls}>{t('auth.company')}</label><input required className={inputCls} value={f.companyName} onChange={set('companyName')} /></div>
        <div className="col-span-2">
          <label className={labelCls}>{t('auth.unified')}</label>
          <input required inputMode="numeric" className={inputCls} value={f.unifiedNumber} onChange={set('unifiedNumber')} placeholder="7000000000" />
          <p className="text-xs text-[#6C6A82] mt-1">{t('auth.unifiedHint')}</p>
        </div>
        <div><label className={labelCls}>{t('auth.cr')}</label><input className={inputCls} value={f.commercialRegister} onChange={set('commercialRegister')} /></div>
        <div><label className={labelCls}>{t('auth.activity')}</label><input className={inputCls} value={f.activity} onChange={set('activity')} placeholder={t('auth.activityPh')} /></div>
        <div><label className={labelCls}>{t('auth.city')}</label><input className={inputCls} value={f.city} onChange={set('city')} /></div>
        <div><label className={labelCls}>{t('auth.contact')}</label><input required className={inputCls} value={f.contactName} onChange={set('contactName')} /></div>
        <div><label className={labelCls}>{t('auth.phone')}</label><input required className={inputCls} value={f.phone} onChange={set('phone')} placeholder="05xxxxxxxx" /></div>
        <div><label className={labelCls}>{t('auth.emailReq')}</label><input required type="email" className={inputCls} value={f.email} onChange={set('email')} /></div>
        <div><label className={labelCls}>{t('auth.passReq')}</label><input required type="password" minLength={8} className={inputCls} value={f.password} onChange={set('password')} /></div>
        <div>
          <label className={labelCls}>{t('auth.plan')}</label>
          <select className={inputCls} value={f.plan} onChange={set('plan')}>
            <option value="BASIC">{t('auth.planBasic')}</option>
            <option value="ADVANCED">{t('auth.planAdv')}</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>{t('auth.crImage')}</label>
          <input required type="file" accept="image/png,image/jpeg,image/webp" className={inputCls} onChange={onCr} />
          <p className="text-xs text-[#6C6A82] mt-1">{t('auth.crHint')}</p>
          {crFilename && <p className="text-xs mt-1">{crFilename}</p>}
        </div>
        <div className="col-span-2">
          <label className={labelCls}>{t('auth.request')}</label>
          <select className={inputCls} value={f.requestType} onChange={set('requestType')}>
            <option value="subscribe">{t('auth.subscribeOpt')}</option>
            <option value="trial">{t('auth.trialOpt')}</option>
          </select>
        </div>
        <div className="col-span-2">
          <label className={labelCls}>{t('auth.code')}</label>
          <div className="flex gap-2">
            <input dir="ltr" className={`${inputCls} uppercase`} value={f.discountCode} onChange={(e) => { setF({ ...f, discountCode: e.target.value }); setCodeMsg(null); }} placeholder="WELCOME10" />
            <button type="button" onClick={checkCode} className="border border-[#E7E5DE] rounded-lg px-4 text-sm whitespace-nowrap">{t('auth.apply')}</button>
          </div>
          {codeMsg && <p className={`text-xs mt-1 ${codeMsg.ok ? 'text-green-700' : 'text-red-600'}`}>{codeMsg.text}</p>}
        </div>
        {error && <p className="col-span-2 text-red-600 text-xs">{error}</p>}
        <button disabled={busy} className={`${btnCls} col-span-2`}>{busy ? t('auth.creating') : t('auth.createBtn')}</button>
      </form>
      <p className="text-center text-xs text-[#6C6A82] mt-4">{t('haveAccount')} <a href="/login" className="underline font-bold text-navy">{t('signInLink')}</a></p>
    </AuthShell>
  );
}
