import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useI18n } from '../i18n';
import { CostCenterSelect } from '../components/CostCenterSelect';

export default function Pos() {
  const { t, lang } = useI18n();
  const nm = (x: any) => (lang === 'en' ? x?.nameEn || x?.nameAr : x?.nameAr);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [customer, setCustomer] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [treasuryId, setTreasuryId] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [discountCode, setDiscountCode] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    api.getProducts().then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => setProducts([]));
    api.getWarehouses().then((w: any) => { const list = Array.isArray(w) ? w : []; setWarehouses(list); if (list[0]) setWarehouseId(list[0].id); }).catch(() => setWarehouses([]));
    api.getTreasuries().then((t: any) => { const list = Array.isArray(t) ? t : []; setTreasuries(list); if (list[0]) setTreasuryId(list[0].id); }).catch(() => setTreasuries([]));
  }, []);

  function onHand(p: any) {
    return (p.balances || []).filter((b: any) => b.warehouseId === warehouseId).reduce((s: number, b: any) => s + Number(b.quantity), 0);
  }
  function add(id: string) {
    const product = products.find((p) => p.id === id);
    const have = product ? onHand(product) : 0;
    setCart((c) => {
      const next = (c[id] || 0) + 1;
      if (next > have + 0.0001) return c;
      return { ...c, [id]: next };
    });
  }
  function remove(id: string) { setCart((c) => { const n = { ...c }; if (n[id] > 1) n[id]--; else delete n[id]; return n; }); }

  const items = (Object.entries(cart) as [string, number][])
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id), qty }))
    .filter((i): i is { product: any; qty: number } => !!i.product);
  const gross = items.reduce((s, i) => s + (i.product?.sellPrice || 0) * i.qty, 0);
  const discount = percent > 0 ? Math.round((gross * percent) / 100 * 100) / 100 : 0;
  const net = Math.round((gross - discount) * 100) / 100;
  const vat = Math.round(net * 15) / 100;
  const total = Math.round((net + vat) * 100) / 100;

  async function applyCode() {
    if (!discountCode.trim()) { setPercent(0); setMsg(''); return; }
    try {
      const r = await api.previewDiscount(discountCode);
      setPercent(Number(r.percent) || 0);
      setDiscountCode(r.code || discountCode);
      setMsg('');
    } catch (e: any) { setPercent(0); setMsg(e.message); }
  }

  async function checkout() {
    if (items.length === 0) { setMsg(t('pos.empty')); return; }
    if (!warehouseId) { setMsg(t('pos.pickWh')); return; }
    if (!treasuryId) { setMsg(t('pos.needTreasury')); return; }
    setBusy(true); setMsg('');
    try {
      let code = discountCode.trim();
      if (code) {
        const r = await api.previewDiscount(code);
        setPercent(Number(r.percent) || 0);
        code = r.code || code;
        setDiscountCode(code);
      }
      await api.posSale({
        customer: customer || t('pos.cashCustomer'), warehouseId, treasuryId, costCenterId: costCenterId || undefined, discountCode: code || undefined,
        lines: items.map((i) => ({ productId: i.product.id, quantity: i.qty, unitPrice: Number(i.product.sellPrice) })),
      });
      setCart({}); setCustomer(''); setDiscountCode(''); setPercent(0);
      const fresh = await api.getProducts();
      setProducts(Array.isArray(fresh) ? fresh : []);
      setMsg(t('pos.done'));
    } catch (e: any) { setMsg(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h2 className="text-xl font-bold mb-1">{t('pos.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4">{t('pos.sub')}</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 grid grid-cols-3 gap-2 content-start">
          {products.map((p) => {
            const have = onHand(p);
            const available = have > 0.0001;
            return (
            <button key={p.id} disabled={!available} onClick={() => add(p.id)} className={`bg-white border border-[#E7E5DE] rounded-xl p-3 text-start ${available ? 'hover:border-gold' : 'opacity-50'}`}>
              <p className="text-sm font-bold">{nm(p)}</p>
              <p className="text-xs text-[#6C6A82]">{Number(p.sellPrice).toFixed(2)} {t('currency')}</p>
              <p className="text-xs text-[#6C6A82]">{available ? `${t('pos.onHand')}: ${have}` : t('pos.unavailable')}</p>
            </button>
            );
          })}
        </div>

        <div className="bg-white border border-[#E7E5DE] rounded-xl p-4">
          <input className="w-full border border-[#E7E5DE] rounded-lg p-2 text-sm mb-2" placeholder={t('customerName')} value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <select className="w-full border border-[#E7E5DE] rounded-lg p-2 text-sm mb-2" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{nm(w)}</option>)}
          </select>
          <div className="mb-2"><CostCenterSelect value={costCenterId} onChange={(id, center) => { setCostCenterId(id); if (center?.defaultWarehouseId) setWarehouseId(center.defaultWarehouseId); }} /></div>
          <select className="w-full border border-[#E7E5DE] rounded-lg p-2 text-sm mb-3" value={treasuryId} onChange={(e) => setTreasuryId(e.target.value)}>
            {treasuries.length === 0 && <option value="">{t('treasury')}</option>}
            {treasuries.map((row) => <option key={row.id} value={row.id}>{nm(row)}</option>)}
          </select>
          {treasuries.length === 0 && <p className="text-xs text-red-700 mb-2">{t('pos.needTreasury')}</p>}
          <div className="flex gap-2 mb-3">
            <input dir="ltr" className="flex-1 border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('disc.placeholder')} value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setPercent(0); }} />
            <button type="button" onClick={applyCode} className="text-xs border border-[#E7E5DE] rounded-lg px-3">{t('disc.apply')}</button>
          </div>

          <div className="max-h-52 overflow-y-auto mb-3">
            {items.map((i) => (
              <div key={i.product.id} className="flex justify-between items-center text-sm py-1.5 border-b border-[#E7E5DE]">
                <span>{nm(i.product)}</span>
                <span className="flex items-center gap-2">
                  <button onClick={() => remove(i.product.id)} className="w-5 h-5 rounded bg-[#F6F5F1]">-</button>
                  {i.qty}
                  <button onClick={() => add(i.product.id)} className="w-5 h-5 rounded bg-[#F6F5F1]">+</button>
                </span>
              </div>
            ))}
            {items.length === 0 && <p className="text-xs text-[#6C6A82]">{t('pos.empty')}</p>}
          </div>

          {percent > 0 ? (
            <div className="text-xs text-[#6C6A82] mb-1 space-y-0.5">
              <p>{t('disc.before')}: {gross.toFixed(2)}</p>
              <p>{t('disc.discount')} ({percent}%): {discount.toFixed(2)}</p>
              <p>{t('disc.after')}: {net.toFixed(2)}</p>
              <p>{t('disc.vatOnNet')}: {vat.toFixed(2)}</p>
            </div>
          ) : (
            <p className="text-xs text-[#6C6A82] mb-1">{t('base')}: {gross.toFixed(2)} — {t('vat')}: {vat.toFixed(2)}</p>
          )}
          <p className="font-bold mb-3">{t('total')}: {total.toFixed(2)} {t('currency')}</p>
          {msg && <p className={`text-xs mb-2 ${msg === t('pos.done') ? 'text-green-700' : 'text-red-700'}`}>{msg}</p>}
          <button disabled={busy} onClick={checkout} className="w-full bg-gold text-navy font-bold rounded-lg py-2.5 text-sm">{busy ? '...' : t('pos.checkout')}</button>
        </div>
      </div>
    </div>
  );
}
