import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { ExcelButton, PrintHeader } from '../components/fin';
import { useI18n } from '../i18n';

export default function Warehouses() {
  const { t, lang } = useI18n();
  const nm = (x: any) => (lang === 'en' ? x?.nameEn || x?.nameAr : x?.nameAr);
  const [branches, setBranches] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [branchName, setBranchName] = useState('');
  const [whName, setWhName] = useState('');
  const [whBranch, setWhBranch] = useState('');

  function load() {
    api.getBranches().then((d) => setBranches(Array.isArray(d) ? d : [])).catch(() => setBranches([]));
    api.getWarehouses().then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => setWarehouses([]));
  }
  useEffect(load, []);

  async function addBranch() { if (!branchName) return; await api.addBranch({ nameAr: branchName }); setBranchName(''); load(); }
  async function addWarehouse() { if (!whName || !whBranch) return; await api.addWarehouse({ nameAr: whName, branchId: whBranch }); setWhName(''); load(); }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1 print:hidden">
        <h2 className="text-xl font-bold">{t('wh.title')}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold shrink-0">🖨 {t('print')}</button>
          <ExcelButton title={t('wh.title')} />
        </div>
      </div>
      <p className="text-sm text-[#6C6A82] mb-5 print:hidden">{t('wh.sub')}</p>
      <PrintHeader title={t('wh.title')} />

      <Card>
        <h3 className="font-bold text-sm mb-2">{t('branches')}</h3>
        <div className="flex gap-2 mb-3 print:hidden">
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm flex-1" placeholder={t('newBranch')} value={branchName} onChange={(e) => setBranchName(e.target.value)} />
          <button onClick={addBranch} className="text-xs bg-navy text-white rounded-lg px-4">{t('addBranch')}</button>
        </div>
        <div className="flex flex-wrap gap-2">
          {branches.map((b) => <span key={b.id} className="text-xs bg-goldsoft text-navy rounded-full px-3 py-1">{nm(b)}{b.isMain && ` (${t('wh.main')})`}</span>)}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-sm mb-2">{t('warehouses')}</h3>
        <div className="grid grid-cols-3 gap-2 mb-3 print:hidden">
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={whBranch} onChange={(e) => setWhBranch(e.target.value)}>
            <option value="">{t('selectBranch')}</option>{branches.map((b) => <option key={b.id} value={b.id}>{nm(b)}</option>)}
          </select>
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm col-span-1" placeholder={t('whName')} value={whName} onChange={(e) => setWhName(e.target.value)} />
          <button onClick={addWarehouse} className="text-xs bg-navy text-white rounded-lg">{t('addWarehouse')}</button>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('warehouse')}</th><th className="text-start">{t('branch')}</th></tr></thead>
          <tbody>{warehouses.map((w) => <tr key={w.id} className="border-t border-[#E7E5DE]"><td className="py-1.5">{nm(w)}</td><td>{nm(w.branch)}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}
