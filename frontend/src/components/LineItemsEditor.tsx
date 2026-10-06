import React from 'react';
import { useI18n } from '../i18n';

export type DocLine = { productId: string; quantity: string; unitPrice: string };

export function LineItemsEditor({ products, lines, setLines, priceFrom = 'sell' }: { products: any[]; lines: DocLine[]; setLines: (l: DocLine[]) => void; priceFrom?: 'sell' | 'cost' }) {
  const { t, lang } = useI18n();
  function update(i: number, patch: Partial<DocLine>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() { setLines([...lines, { productId: '', quantity: '1', unitPrice: '' }]); }
  function removeLine(i: number) { setLines(lines.filter((_, idx) => idx !== i)); }

  const subtotal = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);
  const vat = +(subtotal * 0.15).toFixed(2);

  return (
    <div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-5 gap-2 mb-2">
          <select
            className="col-span-2 border border-[#E7E5DE] rounded-lg p-2 text-sm"
            value={l.productId}
            onChange={(e) => {
              const p = products.find((pr) => pr.id === e.target.value);
              const price = priceFrom === 'cost' ? p?.costPrice : p?.sellPrice;
              update(i, { productId: e.target.value, unitPrice: e.target.value ? String(price ?? '') : '' });
            }}
          >
            <option value="">{t('selectItem')}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.sku} — {lang === 'en' ? p.nameEn || p.nameAr : p.nameAr}</option>)}
          </select>
          <input type="number" placeholder={t('quantity')} className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
          <input type="number" placeholder={t('price')} className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
          <button type="button" onClick={() => removeLine(i)} className="text-xs text-red-600 underline">{t('delete')}</button>
        </div>
      ))}
      <button type="button" onClick={addLine} className="text-xs underline text-[#6C6A82] mb-3">{t('addItem')}</button>
      <p className="text-xs text-[#6C6A82] mb-3">{t('base')}: <b>{subtotal.toFixed(2)}</b> — {t('vat')}: <b>{vat.toFixed(2)}</b> — {t('total')}: <b>{(subtotal + vat).toFixed(2)}</b> {t('currency')}</p>
    </div>
  );
}
