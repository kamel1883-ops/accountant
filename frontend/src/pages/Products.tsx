import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { PrintBar } from '../components/fin';
import { useI18n } from '../i18n';

export default function Products() {
  const { t, lang } = useI18n();
  const nm = (x: any) => (lang === 'en' ? x?.nameEn || x?.nameAr : x?.nameAr);
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const empty = { sku: '', nameAr: '', categoryId: '', unitId: '', costPrice: '', sellPrice: '', reorderPoint: '' };
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState('');
  const [error, setError] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newUnit, setNewUnit] = useState('');

  function load() {
    api.getProducts().then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => setProducts([]));
    api.getCategories().then((d) => setCategories(Array.isArray(d) ? d : [])).catch(() => setCategories([]));
    api.getUnits().then((d) => setUnits(Array.isArray(d) ? d : [])).catch(() => setUnits([]));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const body = { ...form, costPrice: Number(form.costPrice) || 0, sellPrice: Number(form.sellPrice) || 0, reorderPoint: Number(form.reorderPoint) || 0 };
    try {
      if (editing) await api.updateProduct(editing, body);
      else await api.addProduct(body);
      setForm(empty);
      setEditing('');
      load();
    } catch (err: any) { setError(err.message); }
  }

  function startEdit(p: any) {
    setError('');
    setEditing(p.id);
    setForm({
      sku: p.sku || '',
      nameAr: p.nameAr || '',
      categoryId: p.categoryId || '',
      unitId: p.unitId || '',
      costPrice: String(Number(p.costPrice) || 0),
      sellPrice: String(Number(p.sellPrice) || 0),
      reorderPoint: String(Number(p.reorderPoint) || 0),
    });
  }

  async function addCat() { if (!newCat) return; await api.addCategory({ nameAr: newCat }); setNewCat(''); load(); }
  async function addUnit() { if (!newUnit) return; await api.addUnit({ nameAr: newUnit }); setNewUnit(''); load(); }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('prod.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-5 print:hidden">{t('prod.sub')}</p>
      <PrintBar title={t('prod.title')} />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <Card className="!mb-0">
          <h3 className="font-bold text-sm mb-2">{t('categories')}</h3>
          <div className="flex gap-2 mb-2 print:hidden">
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm flex-1" placeholder={t('prod.newCat')} value={newCat} onChange={(e) => setNewCat(e.target.value)} />
            <button onClick={addCat} className="text-xs bg-navy text-white rounded-lg px-3">{t('add')}</button>
          </div>
          <div className="flex flex-wrap gap-1">{categories.map((c) => <span key={c.id} className="text-xs bg-goldsoft text-navy rounded-full px-2 py-1">{nm(c)}</span>)}</div>
        </Card>
        <Card className="!mb-0">
          <h3 className="font-bold text-sm mb-2">{t('units')}</h3>
          <div className="flex gap-2 mb-2 print:hidden">
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm flex-1" placeholder={t('prod.newUnit')} value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
            <button onClick={addUnit} className="text-xs bg-navy text-white rounded-lg px-3">{t('add')}</button>
          </div>
          <div className="flex flex-wrap gap-1">{units.map((u) => <span key={u.id} className="text-xs bg-goldsoft text-navy rounded-full px-2 py-1">{nm(u)}</span>)}</div>
        </Card>
      </div>

      <Card className="print:hidden">
        <form onSubmit={submit} className="grid grid-cols-3 gap-3">
          {editing && <p className="col-span-3 text-sm font-bold">{t('prod.editing')}</p>}
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('sku')} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('itemName')} value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} />
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
            <option value="">{t('category')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{nm(c)}</option>)}
          </select>
          <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}>
            <option value="">{t('unit')}</option>{units.map((u) => <option key={u.id} value={u.id}>{nm(u)}</option>)}
          </select>
          <input type="number" min="0" step="0.01" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('costPrice')} value={form.costPrice} onChange={(e) => setForm({ ...form, costPrice: e.target.value })} />
          <input type="number" min="0" step="0.01" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('sellPrice')} value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
          <input type="number" min="0" step="0.01" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('reorderPoint')} value={form.reorderPoint} onChange={(e) => setForm({ ...form, reorderPoint: e.target.value })} />
          {editing && <p className="col-span-3 text-xs text-[#6C6A82]">{t('prod.priceHint')}</p>}
          {error && <p className="col-span-3 text-red-600 text-xs">{error}</p>}
          <button className="col-span-3 bg-gold text-navy font-bold rounded-lg py-2 text-sm">{editing ? t('prod.save') : t('addProduct')}</button>
          {editing && <button type="button" onClick={() => { setEditing(''); setForm(empty); setError(''); }} className="col-span-3 text-xs underline text-[#6C6A82]">{t('cancel')}</button>}
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">SKU</th><th className="text-start">{t('itemName')}</th><th className="text-start">{t('category')}</th><th className="text-start">{t('costPrice')}</th><th className="text-start">{t('sellPrice')}</th><th className="text-start">{t('totalQty')}</th><th className="text-start print:hidden">{t('actions')}</th></tr></thead>
          <tbody>
            {products.map((p) => {
              const total = (p.balances || []).reduce((s: number, b: any) => s + Number(b.quantity), 0);
              const low = total <= Number(p.reorderPoint);
              return (
                <tr key={p.id} className="border-t border-[#E7E5DE]">
                  <td className="py-1.5">{p.sku}</td><td>{nm(p)}</td><td>{nm(p.category) || '—'}</td>
                  <td>{Number(p.costPrice).toFixed(2)}</td><td>{Number(p.sellPrice).toFixed(2)}</td>
                  <td className={low ? 'text-red-600 font-bold' : ''}>{total} {low && '⚠️'}</td>
                  <td className="print:hidden"><button type="button" onClick={() => startEdit(p)} className="text-xs underline">{t('prod.edit')}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
