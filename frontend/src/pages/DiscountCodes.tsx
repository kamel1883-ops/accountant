import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { useI18n } from '../i18n';

const inp = 'border border-[#E7E5DE] rounded-lg p-2 text-sm w-full';

export default function DiscountCodes() {
  const { t } = useI18n();
  const [codes, setCodes] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [percent, setPercent] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  function load() {
    api.getDiscountCodes().then((rows) => setCodes(Array.isArray(rows) ? rows : [])).catch((e: any) => setErr(e.message));
  }
  useEffect(load, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      await api.addDiscountCode({ code, percent: Number(percent), note });
      setCode(''); setPercent(''); setNote('');
      load();
    } catch (x: any) { setErr(x.message); }
  }

  async function toggle(c: any) {
    try { await api.updateDiscountCode(c.id, { active: !c.active }); load(); } catch (x: any) { setErr(x.message); }
  }

  async function remove(c: any) {
    if (!confirm(`${t('delete')} ${c.code}?`)) return;
    try { await api.deleteDiscountCode(c.id); load(); } catch (x: any) { setErr(x.message); }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('disc.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5">{t('disc.sub')}</p>
      <Card>
        <form onSubmit={create} className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <div>
            <label className="text-xs text-[#6C6A82]">{t('disc.code')}</label>
            <input dir="ltr" required className={inp} value={code} onChange={(e) => setCode(e.target.value)} placeholder="SALE10" />
          </div>
          <div>
            <label className="text-xs text-[#6C6A82]">{t('disc.percent')}</label>
            <input required type="number" min={1} max={100} step="0.01" className={inp} value={percent} onChange={(e) => setPercent(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-[#6C6A82]">{t('disc.note')}</label>
            <input className={inp} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p className="md:col-span-4 text-red-600 text-xs">{err}</p>}
          <button className="md:col-span-4 bg-gold text-navy font-bold rounded-lg py-2 text-sm">{t('disc.create')}</button>
        </form>
      </Card>
      <Card>
        {codes.length === 0 && <p className="text-xs text-[#6C6A82]">{t('disc.empty')}</p>}
        {codes.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#6C6A82] text-xs">
                <th className="text-start py-1">{t('disc.code')}</th>
                <th className="text-start">{t('disc.percent')}</th>
                <th className="text-start">{t('disc.note')}</th>
                <th className="text-start">{t('disc.uses')}</th>
                <th className="text-start">{t('status')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-t border-[#E7E5DE]">
                  <td className="py-1.5 font-bold" dir="ltr">{c.code}</td>
                  <td>{Number(c.percent)}%</td>
                  <td>{c.note || '—'}</td>
                  <td>{c.usedCount}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${c.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{c.active ? t('disc.on') : t('disc.off')}</span></td>
                  <td className="whitespace-nowrap">
                    <button type="button" onClick={() => toggle(c)} className="text-xs underline ml-3">{c.active ? t('disc.disable') : t('disc.enable')}</button>
                    <button type="button" onClick={() => remove(c)} className="text-xs underline text-red-600">{t('delete')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
