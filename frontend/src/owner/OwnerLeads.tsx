import React, { useEffect, useState } from 'react';
import { ownerApi, downloadPdf, openOwnerFile } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

const PLAN_PRICE: Record<string, number> = { BASIC: 1350, ADVANCED: 2000 };
const inp = 'border border-[#E7E5DE] rounded-lg p-2 text-sm w-full';

function ActivateForm({ lead, onDone }: { lead: any; onDone: () => void }) {
  const { t } = useI18n();
  const [f, setF] = useState<any>({
    mode: lead.requestType === 'trial' ? 'trial' : 'subscribe', plan: lead.plan, months: 12,
    discount: lead.quotes?.length ? lead.quotes[lead.quotes.length - 1].discount : 0,
    amountReceived: Math.max(0, PLAN_PRICE[lead.plan] - (lead.quotes?.length ? Number(lead.quotes[lead.quotes.length - 1].discount) || 0 : 0)),
    paymentDate: new Date().toISOString().slice(0, 10), reference: '', trialDays: 14, createInvoice: true,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    try {
      const r = await ownerApi.activateLead(lead.id, { ...f, months: Number(f.months), discount: Number(f.discount), amountReceived: Number(f.amountReceived), trialDays: Number(f.trialDays), createInvoice: f.mode === 'subscribe' && !!f.createInvoice });
      setMsg(r.message); onDone();
    } catch (err: any) { setMsg(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3 bg-[#F6F5F1] rounded-xl p-3">
      <div><label className="text-xs text-[#6C6A82]">{t('own.kind')}</label><select className={inp} value={f.mode} onChange={set('mode')}><option value="subscribe">{t('own.confirmSub')}</option><option value="trial">{t('own.startTrial')}</option></select></div>
      <div><label className="text-xs text-[#6C6A82]">{t('auth.plan')}</label><select className={inp} value={f.plan} onChange={set('plan')}><option value="BASIC">{t('planBasic')}</option><option value="ADVANCED">{t('planAdv')}</option></select></div>
      {f.mode === 'subscribe' ? (
        <>
          <div><label className="text-xs text-[#6C6A82]">{t('own.months')}</label><input type="number" min={1} className={inp} value={f.months} onChange={set('months')} /></div>
          <div><label className="text-xs text-[#6C6A82]">{t('own.discount')}{lead.discountCode ? ` — ${lead.discountCode}` : ''}</label><input type="number" min={0} className={inp} value={f.discount} onChange={set('discount')} /></div>
          <p className="sm:col-span-3 text-xs text-[#6C6A82]">{t('own.noRevenue')}</p>
          <label className="sm:col-span-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!f.createInvoice} onChange={(e) => setF({ ...f, createInvoice: e.target.checked })} /> {t('own.makeInvoice')}</label>
        </>
      ) : (
        <div><label className="text-xs text-[#6C6A82]">{t('own.trialDays')}</label><input type="number" min={1} className={inp} value={f.trialDays} onChange={set('trialDays')} /></div>
      )}
      {msg && <p className="sm:col-span-3 text-xs">{msg}</p>}
      <button disabled={busy} className="sm:col-span-3 bg-navy text-white rounded-lg py-2 text-sm">{busy ? '...' : f.mode === 'subscribe' ? t('own.activateContract') : t('own.activateTrial')}</button>
    </form>
  );
}

export default function OwnerLeads() {
  const { t } = useI18n();
  const [leads, setLeads] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const plan = (p: string) => (p === 'ADVANCED' ? t('planAdv') : t('planBasic'));

  function load() { ownerApi.getLeads().then(setLeads); }
  useEffect(load, []);

  async function sendQuote(id: string) {
    const discount = Number(prompt(t('own.discountPrompt'), '0') || 0);
    await ownerApi.createQuote(id, { discount, send: true });
    load();
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.nav.leads')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('own.leadsSub')}</p>
      {leads.length === 0 && <p className="text-sm text-[#6C6A82]">{t('own.noLeads')}</p>}
      {leads.map((l) => (
        <Card key={l.id}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="font-bold text-sm">{l.companyName}</p>
              <p className="text-xs text-[#6C6A82]">{l.contactName || '—'} · {l.email} · {l.phone} · {t('own.unified')}: {l.unifiedNumber}</p>
              <p className="text-xs text-[#6C6A82]">{t('own.activity')}: {l.activity || '—'} · {t('own.city')}: {l.city || '—'} · {t('auth.plan')}: {plan(l.plan)} · {t('own.request')}: {l.requestType === 'trial' ? t('own.trial') : t('own.subscribe')}{l.discountCode ? ` · ${t('own.code')}: ${l.discountCode}` : ''}</p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${l.status === 'converted' ? 'bg-green-100 text-green-700' : 'bg-goldsoft text-navy'}`}>{l.status === 'converted' ? t('own.activated') : t('own.waiting')}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs mb-1">
            {l.quotes.map((q: any) => <button key={q.id} onClick={() => downloadPdf(`/owner/quotes/${q.id}/pdf`, `${q.number}.pdf`, 'jadara_owner_token')} className="border border-[#E7E5DE] rounded-lg px-3 py-1.5">{t('own.quote')} {q.number}</button>)}
            {l.contracts.map((c: any) => <button key={c.id} onClick={() => downloadPdf(`/owner/contracts/${c.id}/pdf`, `${c.number}.pdf`, 'jadara_owner_token')} className="border border-gold rounded-lg px-3 py-1.5">{t('own.contract')} {c.number}</button>)}
            {(l.serviceInvoices || []).map((inv: any) => <button key={inv.id} onClick={() => downloadPdf(`/owner/invoices/${inv.id}/pdf`, `${inv.number}.pdf`, 'jadara_owner_token')} className="border border-navy rounded-lg px-3 py-1.5">{t('own.invoice')} {inv.number}</button>)}
            {l.hasCr && <button onClick={() => openOwnerFile(`/owner/leads/${l.id}/cr`).catch((e) => alert(e.message))} className="border border-navy text-navy rounded-lg px-3 py-1.5">{t('own.crFile')}</button>}
            <button onClick={() => sendQuote(l.id)} className="underline px-2">{t('own.issueQuote')}</button>
            <button onClick={async () => { try { await ownerApi.createInvoice(l.id); load(); } catch (e: any) { alert(e.message); } }} className="underline px-2">{t('own.createInvoice')}</button>
          </div>
          {l.status !== 'converted' && (
            <>
              <button onClick={() => setOpenId(openId === l.id ? null : l.id)} className="text-xs bg-gold text-navy font-bold rounded-lg px-4 py-1.5 mt-2">{t('own.confirmBtn')}</button>
              <button onClick={async () => { if (!confirm(t('own.terminateLeadAsk'))) return; try { await ownerApi.terminateLead(l.id); load(); } catch (e: any) { alert(e.message); } }} className="text-xs text-red-700 underline px-3 py-1.5 mt-2">{t('own.terminateLead')}</button>
              {openId === l.id && <ActivateForm lead={l} onDone={load} />}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
