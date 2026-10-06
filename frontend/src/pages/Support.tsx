import React, { useEffect, useState } from 'react';
import { api, downloadSupportFile } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

async function filesToPayload(list: FileList | File[] | null) {
  const arr = list ? Array.from(list as FileList) : [];
  const out: { filename: string; mime: string; data: string }[] = [];
  for (const f of arr.slice(0, 5)) {
    const data = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
      r.onerror = () => reject(new Error('file'));
      r.readAsDataURL(f);
    });
    out.push({ filename: f.name, mime: f.type || 'application/octet-stream', data });
  }
  return out;
}

export default function Support() {
  const { t, lang } = useI18n();
  const cat = (id: string) => { const k = `sup.cat.${id}`; const v = t(k); return v === k ? id : v; };
  const st = (s: string) => { const k = `sup.st.${s}`; const v = t(k); return v === k ? s : v; };
  const [cats, setCats] = useState<{ id: string; label: string }[]>([]);
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ category: 'PRINT', subject: '', body: '' });
  const [files, setFiles] = useState<FileList | null>(null);
  const [reply, setReply] = useState('');
  const [replyFiles, setReplyFiles] = useState<FileList | null>(null);

  const load = () => api.supportTickets().then(setList).catch((e) => setErr(e.message));
  useEffect(() => {
    api.supportCategories().then(setCats).catch(() => {});
    load();
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.createSupportTicket({ ...form, attachments: await filesToPayload(files) });
      setForm({ ...form, subject: '', body: '' });
      setFiles(null);
      await load();
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function open(id: string) {
    setErr('');
    try { setSel(await api.supportTicket(id)); } catch (ex: any) { setErr(ex.message); }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!sel) return;
    setBusy(true); setErr('');
    try {
      const t = await api.replySupportTicket(sel.id, { body: reply, attachments: await filesToPayload(replyFiles) });
      setSel(t); setReply(''); setReplyFiles(null); await load();
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('nav.support')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">{t('sup.sub')}</p>
      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}

      <Card>
        <h3 className="font-bold mb-3">{t('sup.new')}</h3>
        <form onSubmit={create} className="grid gap-2 max-w-xl">
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {cats.map((c) => <option key={c.id} value={c.id}>{cat(c.id)}</option>)}
          </select>
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('sup.subject')} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          <textarea className="border border-[#E7E5DE] rounded-lg p-2 text-sm min-h-[100px]" placeholder={t('sup.body')} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="text-xs" />
          <button disabled={busy} className="bg-navy text-white rounded-lg px-4 py-2 text-sm w-fit">{busy ? '...' : t('sup.send')}</button>
        </form>
      </Card>

      <Card>
        <h3 className="font-bold mb-3">{t('sup.mine')}</h3>
        <div className="space-y-1 text-sm">
          {list.length === 0 && <p className="text-[#6C6A82]">{t('sup.empty')}</p>}
          {list.map((row) => (
            <button key={row.id} onClick={() => open(row.id)} className={`w-full text-start border rounded-lg p-2 ${sel?.id === row.id ? 'border-navy' : 'border-[#E7E5DE]'}`}>
              <span className="font-bold">{row.subject}</span>
              <span className="text-xs text-[#6C6A82] ms-2">{cat(row.category)} — {st(row.status)}</span>
              {row.status === 'RESOLVED' && <span className="text-green-700 text-xs ms-2">{t('sup.resolved')}</span>}
              {row.status === 'WAITING_CUSTOMER' && <span className="text-amber-700 text-xs ms-2">{t('sup.needYou')}</span>}
            </button>
          ))}
        </div>
      </Card>

      {sel && (
        <Card>
          <h3 className="font-bold mb-1">{sel.subject}</h3>
          <p className="text-xs text-[#6C6A82] mb-3">{cat(sel.category)} — {st(sel.status)}</p>
          {sel.status === 'RESOLVED' && (
            <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3 mb-3">{t('sup.resolvedBox')}</div>
          )}
          <div className="space-y-3 mb-4">
            {sel.messages?.map((m: any) => (
              <div key={m.id} className={`rounded-lg p-3 text-sm ${m.fromRole === 'OWNER' ? 'bg-[#F7F4EC]' : 'bg-white border border-[#E7E5DE]'}`}>
                <div className="text-xs text-[#6C6A82] mb-1">{m.fromRole === 'OWNER' ? t('sup.brand') : t('sup.you')} · {new Date(m.createdAt).toLocaleString(lang === 'en' ? 'en-GB' : 'ar-SA')}</div>
                {m.requestKind && <div className="text-amber-800 text-xs mb-1">{t('sup.need')}: {t(`sup.req.${m.requestKind}`)}</div>}
                <div className="whitespace-pre-wrap">{m.body}</div>
                {m.attachments?.map((a: any) => (
                  <button key={a.id} type="button" className="text-xs underline block mt-1" onClick={() => downloadSupportFile(`/support/${sel.id}/attachments/${a.id}`, a.filename)}>
                    {a.filename}
                  </button>
                ))}
              </div>
            ))}
          </div>
          {sel.status !== 'RESOLVED' && (
            <form onSubmit={sendReply} className="grid gap-2">
              <textarea className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('sup.replyPh')} value={reply} onChange={(e) => setReply(e.target.value)} />
              <input type="file" multiple onChange={(e) => setReplyFiles(e.target.files)} className="text-xs" />
              <button disabled={busy} className="border border-navy text-navy rounded-lg px-4 py-2 text-sm w-fit">{t('sup.reply')}</button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
