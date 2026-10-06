import React, { useEffect, useState } from 'react';
import { customerApi, downloadPdf } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { AuthShell } from './AuthShell';

export default function CustomerPortal() {
  const { customer, logout } = useAuth();
  const { t } = useI18n();
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState('');
  const status: Record<string, string> = {
    new: t('auth.st.new'), contacted: t('auth.st.contacted'), converted: t('auth.st.converted'), rejected: t('auth.st.rejected'),
  };

  useEffect(() => { customerApi.me().then(setMe).catch((e) => setErr(e.message)); }, []);

  return (
    <AuthShell wide title={`${t('auth.welcome')} ${customer?.contactName || ''}`} subtitle={t('auth.portalSub')}>
      {err && <p className="text-red-600 text-xs mb-3">{err}</p>}
      {me && (
        <div className="text-sm">
          <div className="border border-[#E7E5DE] rounded-xl p-4 mb-3">
            <p className="font-bold">{me.company}</p>
            <p className="text-xs text-[#6C6A82]">{t('auth.planLine')}: {me.plan === 'ADVANCED' ? t('planAdv') : t('planBasic')} — {me.requestType === 'trial' ? t('auth.trialWord') : t('auth.yearWord')}</p>
            <p className="mt-2 bg-goldsoft rounded-lg p-2 text-xs">{status[me.status] || me.status}</p>
            {me.status === 'converted' && <a href="/login" onClick={logout} className="text-xs underline mt-2 inline-block">{t('auth.relogin')}</a>}
          </div>

          {Array.isArray(me.quotes) && me.quotes.length > 0 && (
            <div className="border border-[#E7E5DE] rounded-xl p-4 mb-3">
              <h3 className="font-bold mb-2">{t('auth.quotes')}</h3>
              {me.quotes.map((q: any) => (
                <div key={q.id} className="flex justify-between items-center py-1">
                  <span>{q.number} — {Number(q.total).toLocaleString('en-US')} {t('currency')}</span>
                  <button onClick={() => downloadPdf(`/customer/quotes/${q.id}/pdf`, `${q.number}.pdf`)} className="text-xs underline">{t('auth.download')}</button>
                </div>
              ))}
              <p className="text-xs text-[#6C6A82] mt-3">{t('auth.payHint')} {me.bank?.beneficiary} — IBAN: <span dir="ltr">{me.bank?.iban}</span> — <b>{me.supportEmail}</b></p>
            </div>
          )}

          {Array.isArray(me.contracts) && me.contracts.length > 0 && (
            <div className="border border-[#E7E5DE] rounded-xl p-4 mb-3">
              <h3 className="font-bold mb-2">{t('auth.contracts')}</h3>
              {me.contracts.map((c: any) => (
                <div key={c.id} className="flex justify-between items-center py-1">
                  <span>{c.number}</span>
                  <button onClick={() => downloadPdf(`/customer/contracts/${c.id}/pdf`, `${c.number}.pdf`)} className="text-xs underline">{t('auth.download')}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <button onClick={logout} className="text-xs underline text-[#6C6A82]">{t('logout')}</button>
    </AuthShell>
  );
}
