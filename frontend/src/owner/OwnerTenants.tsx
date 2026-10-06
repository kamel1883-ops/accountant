import React, { useEffect, useState } from 'react';
import { ownerApi, downloadPdf, openOwnerFile } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

const price: Record<string, number> = { BASIC: 1350, ADVANCED: 2000 };
const days = (d: string | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / 86400000) : null);

export default function OwnerTenants() {
  const { t } = useI18n();
  const tabs = [
    { key: 'ALL', label: t('own.all') }, { key: 'ACTIVE', label: t('own.activeTab') }, { key: 'TRIAL', label: t('own.trial') },
    { key: 'SUSPENDED', label: t('own.suspended') }, { key: 'SOON', label: t('own.soonTab') }, { key: 'EXPIRED', label: t('own.expiredTab') },
  ];
  const status = (s: string) => { const k = `own.st.${s}`; const v = t(k); return v === k ? s : v; };
  const [tenants, setTenants] = useState<any[]>([]);
  const [tab, setTab] = useState('ALL');
  const [renewId, setRenewId] = useState<string | null>(null);
  const [rf, setRf] = useState<any>({ startDate: '', endDate: '', amountReceived: '', reference: '' });
  const [mailFor, setMailFor] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [mailMsg, setMailMsg] = useState('');

  function load() { ownerApi.getTenants().then(setTenants); }
  useEffect(load, []);

  const endOf = (row: any) => (row.subscription?.status === 'TRIAL' ? row.subscription?.trialEndsAt : row.subscription?.endDate);
  const shown = tenants.filter((row) => {
    const st = row.subscription?.status; const left = days(endOf(row));
    if (tab === 'ALL') return true;
    if (tab === 'SOON') return st === 'ACTIVE' && left !== null && left <= 60;
    return st === tab;
  });

  async function setStatus(id: string, st: string) { await ownerApi.updateSubscription(id, { status: st }); load(); }
  function yearFrom(start: string) {
    const d = new Date(start || new Date().toISOString().slice(0, 10));
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }
  async function saveAdminEmail(tenantId: string, userId: string) {
    setMailMsg('');
    try {
      await ownerApi.replaceAdminEmail(tenantId, userId, drafts[userId] || '');
      setDrafts((p) => ({ ...p, [userId]: '' }));
      setMailMsg(t('own.emailSaved'));
      load();
    } catch (e: any) { setMailMsg(e.message); }
  }

  async function renew(row: any) {
    if (!rf.startDate || !rf.endDate || new Date(rf.endDate) <= new Date(rf.startDate)) return alert(t('own.badDates'));
    if (!(Number(rf.amountReceived) > 0)) return alert(t('own.badAmount'));
    await ownerApi.renewTenant(row.id, { startDate: rf.startDate, endDate: rf.endDate, amountReceived: Number(rf.amountReceived), reference: rf.reference || undefined, plan: row.subscription?.plan });
    setRenewId(null); load();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.nav.tenants')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">{t('own.tenantsSub')}</p>
      <div className="flex gap-2 flex-wrap mb-4">
        {tabs.map((x) => <button key={x.key} onClick={() => setTab(x.key)} className={`text-sm px-4 py-1.5 rounded-lg ${tab === x.key ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{x.label}</button>)}
      </div>
      <Card>
        {shown.length === 0 && <p className="text-xs text-[#6C6A82]">{t('own.emptyTab')}</p>}
        {shown.map((row) => {
          const st = row.subscription?.status; const left = days(endOf(row));
          return (
            <div key={row.id} className="border-b border-[#E7E5DE] last:border-0 py-3">
              <div className="flex justify-between items-center gap-3 flex-wrap">
                <div>
                  <p className="font-bold text-sm">{row.companyName}</p>
                  <p className="text-xs text-[#6C6A82]">{t('print.unified')}: <span dir="ltr">{row.unifiedNumber}</span> · {row.subscription?.plan === 'ADVANCED' ? t('planAdv') : t('planBasic')} · {st === 'TRIAL' ? t('own.trialEnds') : t('own.contractEnds')}: {endOf(row) ? new Date(endOf(row)).toLocaleDateString('en-GB') : '—'}{left !== null && ` (${left < 0 ? t('ended') : `${left} ${t('days')}`})`}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${st === 'ACTIVE' ? 'bg-green-100 text-green-700' : st === 'TRIAL' ? 'bg-goldsoft text-navy' : st === 'SUSPENDED' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'}`}>{status(st)}</span>
                  <button onClick={() => { const start = new Date().toISOString().slice(0, 10); setRenewId(renewId === row.id ? null : row.id); setRf({ startDate: start, endDate: yearFrom(start), amountReceived: price[row.subscription?.plan] || 1350, reference: '' }); }} className="text-xs bg-gold text-navy font-bold rounded-lg px-3 py-1">{st === 'TRIAL' ? t('own.convert') : t('own.renew')}</button>
                  {st === 'SUSPENDED'
                    ? <button onClick={async () => { await ownerApi.resumeTenant(row.id); load(); }} className="text-xs bg-navy text-white rounded-lg px-3 py-1">{t('own.resume')}</button>
                    : <button onClick={async () => { if (confirm(t('own.pauseAsk'))) { await ownerApi.suspendTenant(row.id); load(); } }} className="text-xs border border-amber-600 text-amber-800 rounded-lg px-3 py-1">{t('own.pause')}</button>}
                  {(st === 'TRIAL' || st === 'EXPIRED') && <button onClick={async () => { const n = Number(prompt(t('own.extendAsk'), '14')); if (!(n > 0)) return; const trialEndsAt = new Date(Date.now() + n * 86400000).toISOString(); await ownerApi.updateSubscription(row.id, { status: 'TRIAL', trialEndsAt }); load(); }} className="text-xs border border-navy text-navy rounded-lg px-3 py-1">{t('own.extendTrial')}</button>}
                  {st !== 'CANCELLED' && <button onClick={() => setStatus(row.id, 'CANCELLED')} className="text-xs underline text-red-600">{t('cancel')}</button>}
                  <button onClick={async () => { if (!confirm(t('own.terminateTenantAsk'))) return; try { await ownerApi.terminateTenant(row.id); load(); } catch (e: any) { alert(e.message); } }} className="text-xs text-red-700 underline">{t('own.terminateTenant')}</button>
                  <button onClick={() => { setMailFor(mailFor === row.id ? null : row.id); setMailMsg(''); }} className="text-xs border border-navy text-navy rounded-lg px-3 py-1">{t('own.restoreEmail')}</button>
                </div>
              </div>
              {mailFor === row.id && (
                <div className="mt-3 bg-[#F6F5F1] rounded-xl p-3">
                  <p className="text-xs text-[#6C6A82] mb-2">{t('own.adminOnly')}</p>
                  {mailMsg && <p className="text-xs mb-2">{mailMsg}</p>}
                  {(row.users || []).map((u: any) => (
                    <div key={u.id} className="border-t border-[#E7E5DE] py-2 first:border-0">
                      <p className="text-sm font-bold">{u.nameAr} <span className="text-xs font-normal text-[#6C6A82]">· {t(`role.${u.role}`)}</span></p>
                      <p className="text-xs" dir="ltr">{u.email}</p>
                      {Array.isArray(u.emailHistory) && u.emailHistory.length > 0 && (
                        <p className="text-xs text-[#6C6A82]">{t('users.prevEmails')}: {u.emailHistory.map((h: any) => h.email).join('، ')}</p>
                      )}
                      {u.role === 'ADMIN' && (
                        <div className="flex gap-2 mt-2">
                          <input type="email" className="border border-[#E7E5DE] rounded-lg p-2 text-sm flex-1" placeholder={t('users.changeEmail')} value={drafts[u.id] || ''} onChange={(e) => setDrafts({ ...drafts, [u.id]: e.target.value })} />
                          <button onClick={() => saveAdminEmail(row.id, u.id)} className="text-xs bg-navy text-white rounded-lg px-3">{t('save')}</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {(row.users || []).length === 0 && <p className="text-xs text-[#6C6A82]">—</p>}
                </div>
              )}
              {renewId === row.id && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 bg-[#F6F5F1] rounded-xl p-3">
                  <div><label className="text-xs text-[#6C6A82]">{t('own.fromDate')}</label><input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm w-full" value={rf.startDate} onChange={(e) => setRf({ ...rf, startDate: e.target.value, endDate: yearFrom(e.target.value) })} /></div>
                  <div><label className="text-xs text-[#6C6A82]">{t('own.toDate')}</label><input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm w-full" value={rf.endDate} onChange={(e) => setRf({ ...rf, endDate: e.target.value })} /></div>
                  <div><label className="text-xs text-[#6C6A82]">{t('own.amount')}</label><input type="number" min={1} className="border border-[#E7E5DE] rounded-lg p-2 text-sm w-full" value={rf.amountReceived} onChange={(e) => setRf({ ...rf, amountReceived: e.target.value })} /></div>
                  <div><label className="text-xs text-[#6C6A82]">{t('own.reference')}</label><input className="border border-[#E7E5DE] rounded-lg p-2 text-sm w-full" value={rf.reference} onChange={(e) => setRf({ ...rf, reference: e.target.value })} /></div>
                  <button onClick={() => renew(row)} className="sm:col-span-2 bg-navy text-white rounded-lg py-2 text-sm">{t('own.book')}</button>
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-xs mt-2">
                {(row.contracts || []).map((c: any) => <button key={c.id} onClick={() => downloadPdf(`/owner/contracts/${c.id}/pdf`, `${c.number}.pdf`, 'jadara_owner_token')} className="border border-gold rounded-lg px-3 py-1">{t('own.contract')} {c.number}</button>)}
                {(row.serviceInvoices || []).map((inv: any) => <button key={inv.id} onClick={() => downloadPdf(`/owner/invoices/${inv.id}/pdf`, `${inv.number}.pdf`, 'jadara_owner_token')} className="border border-navy rounded-lg px-3 py-1">{t('own.invoice')} {inv.number}</button>)}
                <button onClick={async () => { try { await ownerApi.createTenantInvoice(row.id); load(); } catch (e: any) { alert(e.message); } }} className="underline px-2">{t('own.createInvoice')}</button>
                <button onClick={() => openOwnerFile(`/owner/tenants/${row.id}/cr`).catch((e) => alert(e.message))} className="border border-navy text-navy rounded-lg px-3 py-1">{t('own.crFile')}</button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
