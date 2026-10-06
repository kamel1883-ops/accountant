import React, { useEffect, useState } from 'react';
import { ownerApi } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

const inp = 'border border-[#E7E5DE] rounded-lg p-2 text-sm w-full';
const empty = { code: '', type: 'PERCENT', value: '', plan: '', maxUses: '', validUntil: '', note: '' };

export default function OwnerCodes() {
  const { t } = useI18n();
  const [codes, setCodes] = useState<any[]>([]);
  const [f, setF] = useState<any>(empty);
  const [err, setErr] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<any>) => setF({ ...f, [k]: e.target.value });
  const plan = (p: string) => (p === 'ADVANCED' ? t('planAdv') : p === 'BASIC' ? t('planBasic') : t('planAll'));

  function load() { ownerApi.getCodes().then(setCodes); }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await ownerApi.createCode({ ...f, value: Number(f.value), maxUses: f.maxUses ? Number(f.maxUses) : undefined, plan: f.plan || undefined }); setF(empty); load(); }
    catch (x: any) { setErr(x.message); }
  }
  async function toggle(c: any) { await ownerApi.updateCode(c.id, { active: !c.active }); load(); }
  async function remove(c: any) {
    if (!confirm(`${t('own.deleteCode')} ${c.code}?`)) return;
    try { await ownerApi.deleteCode(c.id); load(); } catch (x: any) { alert(x.message); }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('own.nav.codes')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('own.codesSub')}</p>
      <Card>
        <form onSubmit={create} className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><label className="text-xs text-[#6C6A82]">{t('own.codePh')}</label><input dir="ltr" className={inp} value={f.code} onChange={set('code')} placeholder="WELCOME10" /></div>
          <div><label className="text-xs text-[#6C6A82]">{t('type')}</label><select className={inp} value={f.type} onChange={set('type')}><option value="PERCENT">{t('own.percent')}</option><option value="FIXED">{t('own.fixed')}</option></select></div>
          <div><label className="text-xs text-[#6C6A82]">{f.type === 'PERCENT' ? t('own.percentVal') : t('own.amountSar')}</label><input required type="number" min={1} className={inp} value={f.value} onChange={set('value')} /></div>
          <div><label className="text-xs text-[#6C6A82]">{t('auth.plan')}</label><select className={inp} value={f.plan} onChange={set('plan')}><option value="">{t('planAll')}</option><option value="BASIC">{t('planBasic')}</option><option value="ADVANCED">{t('planAdv')}</option></select></div>
          <div><label className="text-xs text-[#6C6A82]">{t('own.maxUses')}</label><input type="number" min={1} className={inp} value={f.maxUses} onChange={set('maxUses')} placeholder={t('own.noLimit')} /></div>
          <div><label className="text-xs text-[#6C6A82]">{t('own.endsOn')}</label><input type="date" className={inp} value={f.validUntil} onChange={set('validUntil')} /></div>
          <div className="col-span-2"><label className="text-xs text-[#6C6A82]">{t('own.note')}</label><input className={inp} value={f.note} onChange={set('note')} placeholder={t('own.notePh')} /></div>
          {err && <p className="col-span-full text-red-600 text-xs">{err}</p>}
          <button className="col-span-full bg-gold text-navy font-bold rounded-lg py-2 text-sm">{t('own.createCode')}</button>
        </form>
      </Card>
      <Card>
        {codes.length === 0 && <p className="text-xs text-[#6C6A82]">{t('own.noCodes')}</p>}
        {codes.length > 0 && (
          <table className="w-full text-sm">
            <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('own.code')}</th><th className="text-start">{t('own.discountCol')}</th><th className="text-start">{t('auth.plan')}</th><th className="text-start">{t('own.uses')}</th><th className="text-start">{t('own.ends')}</th><th className="text-start">{t('status')}</th><th></th></tr></thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-[#E7E5DE]">
                  <td className="py-1.5 font-bold" dir="ltr">{c.code}</td>
                  <td>{c.type === 'PERCENT' ? `${c.value}%` : `${c.value} ${t('currency')}`}</td>
                  <td>{plan(c.plan)}</td>
                  <td>{c.usedCount}{c.maxUses ? ` / ${c.maxUses}` : ''}</td>
                  <td>{c.validUntil ? new Date(c.validUntil).toLocaleDateString('en-GB') : '—'}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.active ? t('own.on') : t('own.off')}</span></td>
                  <td className="whitespace-nowrap"><button onClick={() => toggle(c)} className="text-xs underline ml-3">{c.active ? t('own.disable') : t('own.enable')}</button><button onClick={() => remove(c)} className="text-xs underline text-red-600">{t('delete')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
