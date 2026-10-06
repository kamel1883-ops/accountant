import React, { useEffect, useState } from 'react';
import { ownerApi, downloadSupportFile } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

export default function OwnerSupport() {
  const { t, lang } = useI18n();
  const [meta, setMeta] = useState<{ requestKinds: { id: string; label: string }[] }>({ requestKinds: [] });
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [filter, setFilter] = useState('open');
  const status = (s: string) => ({ OPEN: t('own.stOpen'), WAITING_OWNER: t('own.stYou'), WAITING_CUSTOMER: t('own.stThem'), RESOLVED: t('own.stDone') } as Record<string, string>)[s] || s;
  const cat = (id: string) => { const k = `sup.cat.${id}`; const v = t(k); return v === k ? id : v; };

  const load = () => ownerApi.supportTickets().then(setList).catch((e) => setErr(e.message));
  useEffect(() => {
    ownerApi.supportMeta().then(setMeta).catch(() => {});
    load();
  }, []);

  async function open(id: string) {
    try { setSel(await ownerApi.supportTicket(id)); setErr(''); } catch (e: any) { setErr(e.message); }
  }

  async function filesToPayload(list: FileList | null) {
    const arr = list ? Array.from(list) : [];
    const out: { filename: string; mime: string; data: string }[] = [];
    for (const f of arr.slice(0, 5)) {
      const data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
        r.onerror = () => reject(new Error(t('sup.readFail')));
        r.readAsDataURL(f);
      });
      out.push({ filename: f.name, mime: f.type || 'application/octet-stream', data });
    }
    return out;
  }

  async function reply(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) return;
    setBusy(true);
    try {
      const ticket = await ownerApi.replySupport(sel.id, { body, requestKind: kind || undefined, attachments: await filesToPayload(files) });
      setSel(ticket); setBody(''); setKind(''); setFiles(null); await load();
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function resolve() {
    if (!sel) return;
    setBusy(true);
    try {
      const ticket = await ownerApi.resolveSupport(sel.id, { body: body || t('sup.resolved') });
      setSel(ticket); setBody(''); await load();
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  const shown = list.filter((row) => filter === 'all' || (filter === 'open' ? row.status !== 'RESOLVED' : row.status === 'RESOLVED'));
  const locale = lang === 'en' ? 'en-GB' : 'ar-SA';

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.tickets')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">{t('own.ticketsSub')}</p>
      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      <div className="flex gap-2 mb-3 text-sm">
        {[['open', t('own.open')], ['resolved', t('own.solved')], ['all', t('own.all')]].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1 rounded-lg border ${filter === k ? 'bg-navy text-white border-navy' : 'border-[#E7E5DE]'}`}>{l}</button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          {shown.length === 0 && <p className="text-sm text-[#6C6A82]">{t('own.noTickets')}</p>}
          {shown.map((row) => (
            <button key={row.id} onClick={() => open(row.id)} className={`w-full text-start border rounded-lg p-2 mb-2 text-sm ${sel?.id === row.id ? 'border-navy' : 'border-[#E7E5DE]'}`}>
              <div className="font-bold">{row.subject}</div>
              <div className="text-xs text-[#6C6A82]">{row.companyName} — {cat(row.category)} — {status(row.status)}</div>
            </button>
          ))}
        </Card>
        {sel && (
          <Card>
            <h3 className="font-bold">{sel.subject}</h3>
            <p className="text-xs text-[#6C6A82] mb-3">{sel.companyName} · {sel.opener} · {status(sel.status)}</p>
            <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
              {sel.messages?.map((m: any) => (
                <div key={m.id} className={`rounded-lg p-2 text-sm ${m.fromRole === 'OWNER' ? 'bg-[#F7F4EC]' : 'border border-[#E7E5DE]'}`}>
                  <div className="text-xs text-[#6C6A82]">{m.fromRole === 'OWNER' ? t('own.you') : t('own.customer')} · {new Date(m.createdAt).toLocaleString(locale)}</div>
                  <div className="whitespace-pre-wrap">{m.body}</div>
                  {m.attachments?.map((a: any) => (
                    <button key={a.id} type="button" className="text-xs underline block" onClick={() => downloadSupportFile(`/owner/support/${sel.id}/attachments/${a.id}`, a.filename, 'jadara_owner_token')}>{a.filename}</button>
                  ))}
                </div>
              ))}
            </div>
            {sel.status !== 'RESOLVED' && (
              <form onSubmit={reply} className="grid gap-2">
                <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">{t('own.replyOnly')}</option>
                  {meta.requestKinds.map((k) => <option key={k.id} value={k.id}>{t(`sup.req.${k.id}`)}</option>)}
                </select>
                <textarea className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('own.msgPh')} value={body} onChange={(e) => setBody(e.target.value)} />
                <input type="file" multiple className="text-xs" onChange={(e) => setFiles(e.target.files)} />
                <div className="flex gap-2">
                  <button disabled={busy} className="bg-navy text-white rounded-lg px-3 py-2 text-sm">{t('own.sendCustomer')}</button>
                  <button type="button" disabled={busy} onClick={resolve} className="border border-green-700 text-green-800 rounded-lg px-3 py-2 text-sm">{t('own.resolve')}</button>
                </div>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
