import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { rememberCompany } from '../components/fin';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

export default function Users() {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ nameAr: '', email: '', password: '', role: 'ACCOUNTANT' });
  const [logo, setLogo] = useState('');
  const [logoBusy, setLogoBusy] = useState(false);
  const [emails, setEmails] = useState<Record<string, string>>({});
  const [passes, setPasses] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');

  const load = () => api.getUsers().then(setData).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
    api.getCompany().then((c) => { setLogo(c.logoDataUrl || ''); rememberCompany(c); }).catch(() => {});
  }, []);

  const users = Array.isArray(data?.users) ? data.users : [];
  const isAdmin = me?.role === 'ADMIN';
  const atLimit = data && users.length >= Number(data.maxUsers || 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api.addUser(form);
      setForm({ nameAr: '', email: '', password: '', role: 'ACCOUNTANT' });
      await load();
    } catch (ex: any) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function setRole(id: string, role: string) {
    setErr('');
    try { await api.updateUser(id, { role }); await load(); }
    catch (ex: any) { setErr(ex.message); }
  }

  async function saveEmail(id: string) {
    setErr(''); setNote('');
    try {
      await api.updateUser(id, { email: emails[id] || '' });
      setEmails((p) => ({ ...p, [id]: '' }));
      setNote(t('users.emailSaved'));
      await load();
    } catch (ex: any) { setErr(ex.message); }
  }

  async function savePass(id: string) {
    setErr(''); setNote('');
    try {
      await api.updateUser(id, { password: passes[id] || '' });
      setPasses((p) => ({ ...p, [id]: '' }));
      setNote(t('users.passSaved'));
    } catch (ex: any) { setErr(ex.message); }
  }

  async function remove(id: string) {
    if (!confirm(t('users.deleteAsk'))) return;
    setErr('');
    try { await api.deleteUser(id); await load(); }
    catch (ex: any) { setErr(ex.message); }
  }

  if (!data) return <p className="text-sm text-[#6C6A82]">{err || t('loading')}</p>;

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('nav.users')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">
        {t('users.sub')} {t('users.plan')} {data.plan === 'ADVANCED' ? t('planAdv') : t('planBasic')}: {users.length} / {data.maxUsers}
      </p>
      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {note && <p className="text-green-700 text-sm mb-3">{note}</p>}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#6C6A82] text-start">
              <th className="py-2 font-medium">{t('users.name')}</th>
              <th className="font-medium">{t('email')}</th>
              <th className="font-medium">{t('users.role')}</th>
              {isAdmin && <th className="font-medium">{t('actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <React.Fragment key={u.id}>
                <tr className="border-t border-[#E7E5DE]">
                  <td className="py-2">
                    {u.nameAr}{u.id === data.meId ? <span className="text-[#C6A15B] text-xs ms-2"> ({t('users.you')})</span> : null}
                  </td>
                  <td>{u.email}</td>
                  <td>
                    {isAdmin && u.id !== data.meId ? (
                      <select className="border rounded-lg px-2 py-1" value={u.role} onChange={(e) => setRole(u.id, e.target.value)}>
                        <option value="ADMIN">{t('role.ADMIN')}</option>
                        <option value="ACCOUNTANT">{t('role.ACCOUNTANT')}</option>
                        <option value="VIEWER">{t('role.VIEWER')}</option>
                      </select>
                    ) : t(`role.${u.role}`)}
                  </td>
                  {isAdmin && (
                    <td>
                      {u.id !== data.meId && (
                        <button type="button" className="text-red-700 text-xs underline" onClick={() => remove(u.id)}>{t('delete')}</button>
                      )}
                    </td>
                  )}
                </tr>
                {isAdmin && (
                  <tr>
                    <td colSpan={4} className="pb-3">
                      <div className="flex flex-wrap gap-2 items-center">
                        {u.role !== 'ADMIN' && (
                          <>
                            <input type="email" className="border rounded-lg px-2 py-1 text-xs" placeholder={t('users.changeEmail')} value={emails[u.id] || ''} onChange={(e) => setEmails({ ...emails, [u.id]: e.target.value })} />
                            <button type="button" className="text-xs bg-navy text-white rounded-lg px-3 py-1" onClick={() => saveEmail(u.id)}>{t('users.saveEmail')}</button>
                          </>
                        )}
                        <input type="password" className="border rounded-lg px-2 py-1 text-xs" placeholder={t('users.newPass')} value={passes[u.id] || ''} onChange={(e) => setPasses({ ...passes, [u.id]: e.target.value })} />
                        <button type="button" className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-1" onClick={() => savePass(u.id)}>{t('users.resetPass')}</button>
                        {Array.isArray(u.previousEmails) && u.previousEmails.length > 0 && (
                          <span className="text-xs text-[#6C6A82]">{t('users.prevEmails')}: {u.previousEmails.join('، ')}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 text-xs text-[#6C6A82] space-y-1">
          {['ADMIN', 'ACCOUNTANT', 'VIEWER'].map((k) => <li key={k}><b>{t(`role.${k}`)}:</b> {t(`users.role.${k}`)}</li>)}
        </ul>
      </Card>

      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-1">{t('users.logo')}</h3>
          <p className="text-xs text-[#6C6A82] mb-3">{t('users.logoHint')}</p>
          <div className="flex flex-wrap items-center gap-4">
            {logo ? <img src={logo} alt="" className="h-14 w-auto max-w-[160px] object-contain border border-[#E7E5DE] rounded-lg p-1" /> : null}
            <label className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 cursor-pointer">
              {logoBusy ? '...' : t('users.logoPick')}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={logoBusy} onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 400 * 1024) { setErr(t('users.logoType')); return; }
                const reader = new FileReader();
                reader.onload = async () => {
                  setLogoBusy(true); setErr('');
                  try {
                    const saved = await api.setCompanyLogo(String(reader.result || ''));
                    setLogo(saved.logoDataUrl || '');
                    const c = await api.getCompany();
                    rememberCompany(c);
                  } catch (ex: any) { setErr(ex.message); }
                  finally { setLogoBusy(false); }
                };
                reader.readAsDataURL(file);
              }} />
            </label>
            {logo && (
              <button type="button" className="text-sm text-red-700 underline" disabled={logoBusy} onClick={async () => {
                setLogoBusy(true); setErr('');
                try {
                  await api.clearCompanyLogo();
                  setLogo('');
                  const c = await api.getCompany();
                  rememberCompany(c);
                } catch (ex: any) { setErr(ex.message); }
                finally { setLogoBusy(false); }
              }}>{t('users.logoRemove')}</button>
            )}
          </div>
          <p className="text-xs text-[#6C6A82] mt-2">{t('users.logoType')}</p>
        </Card>
      )}

      {isAdmin && (
        <Card>
          <h3 className="font-bold mb-3">{t('users.add')}</h3>
          {atLimit ? (
            <p className="text-sm text-[#6C6A82]">{t('users.limit')}</p>
          ) : (
            <form onSubmit={add} className="grid gap-2 max-w-md">
              <input className="border rounded-lg px-3 py-2" placeholder={t('users.name')} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} required />
              <input className="border rounded-lg px-3 py-2" type="email" placeholder={t('email')} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              <input className="border rounded-lg px-3 py-2" type="password" placeholder={t('users.passPh')} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              <select className="border rounded-lg px-3 py-2" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="ADMIN">{t('role.ADMIN')}</option>
                <option value="ACCOUNTANT">{t('role.ACCOUNTANT')}</option>
                <option value="VIEWER">{t('role.VIEWER')}</option>
              </select>
              <button disabled={busy} className="bg-navy text-white rounded-lg py-2 font-bold">{busy ? '...' : t('add')}</button>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
