import React, { useEffect, useState } from 'react';
import { api, openPdf } from '../api/client';
import { Card } from '../components/Layout';
import { PrintBar } from '../components/fin';
import { useI18n } from '../i18n';
import { LineItemsEditor, DocLine } from '../components/LineItemsEditor';
import { CostCenterSelect } from '../components/CostCenterSelect';

const TYPE_KEYS = ['QUOTATION', 'ORDER', 'INVOICE', 'RETURN'];

export default function Sales() {
  const { t, lang } = useI18n();
  const [type, setType] = useState('INVOICE');
  const [docs, setDocs] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [customer, setCustomer] = useState('');
  const [customerVat, setCustomerVat] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [lines, setLines] = useState<DocLine[]>([{ productId: '', quantity: '1', unitPrice: '' }]);
  const [discountCode, setDiscountCode] = useState('');
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState('');

  function loadDocs() {
    void api.getSalesDocs(type)
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch((err: any) => { setDocs([]); setError(err.message); });
  }
  useEffect(() => { loadDocs(); }, [type]);
  useEffect(() => { void api.getProducts().then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => setProducts([])); void api.getWarehouses().then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => setWarehouses([])); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsedLines = lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }));
    if (!customer || parsedLines.length === 0) { setError(t('customerName')); return; }
    const vat = customerVat.replace(/\s/g, '');
    if (vat && !/^3\d{13}3$/.test(vat)) { setError(t('sales.badVat')); return; }
    try {
      let code = discountCode.trim();
      if (code) {
        const r = await api.previewDiscount(code);
        setPercent(Number(r.percent) || 0);
        code = r.code || code;
      }
      await api.addSalesDoc({ type, customer, customerVat: customerVat || undefined, warehouseId: warehouseId || undefined, costCenterId: costCenterId || undefined, discountCode: code || undefined, lines: parsedLines });
      setCustomer(''); setCustomerVat(''); setDiscountCode(''); setPercent(0); setCostCenterId(''); setLines([{ productId: '', quantity: '1', unitPrice: '' }]);
      loadDocs();
    } catch (err: any) { setError(err.message); }
  }

  async function confirm(id: string) {
    try { await api.confirmSalesDoc(id); loadDocs(); } catch (err: any) { alert(err.message); }
  }

  const needsWarehouse = type === 'INVOICE' || type === 'RETURN';

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('sales.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('sales.sub')}</p>
      <PrintBar title={`${t('sales.title')} — ${t(`doc.${type}`)}`} excel={false} />

      <div className="flex gap-2 mb-4 flex-wrap print:hidden">
        {TYPE_KEYS.map((k) => <button key={k} onClick={() => setType(k)} className={`text-sm px-4 py-1.5 rounded-lg ${type === k ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t(`doc.${k}`)}</button>)}
      </div>

      <Card className="print:hidden">
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('customerName')} value={customer} onChange={(e) => setCustomer(e.target.value)} />
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('zatca.vat')} value={customerVat} onChange={(e) => setCustomerVat(e.target.value)} />
            {needsWarehouse && (
              <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
                <option value="">{t('selectWarehouse')}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{lang === 'en' ? w.nameEn || w.nameAr : w.nameAr}</option>)}
              </select>
            )}
            {(type === 'INVOICE' || type === 'RETURN') && (
              <CostCenterSelect value={costCenterId} onChange={(id, center) => { setCostCenterId(id); if (center?.defaultWarehouseId) setWarehouseId(center.defaultWarehouseId); }} />
            )}
          </div>
          <div className="flex gap-2 mb-3">
            <input dir="ltr" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('disc.placeholder')} value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setPercent(0); }} />
            <button type="button" onClick={async () => {
              if (!discountCode.trim()) { setPercent(0); return; }
              try { const r = await api.previewDiscount(discountCode); setPercent(Number(r.percent) || 0); setDiscountCode(r.code || discountCode); setError(''); }
              catch (err: any) { setPercent(0); setError(err.message); }
            }} className="text-xs border border-[#E7E5DE] rounded-lg px-3">{t('disc.apply')}</button>
          </div>
          <LineItemsEditor products={products} lines={lines} setLines={setLines} />
          <SaleTotals lines={lines} percent={percent} t={t} />
          {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
          <button className="bg-gold text-navy font-bold rounded-lg py-2 px-5 text-sm">{t('saveDraft')}</button>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('customer')}</th><th className="text-start">{t('total')}</th><th className="text-start">{t('status')}</th><th className="text-start print:hidden">{t('actions')}</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-[#E7E5DE]">
                <td className="py-1.5">{d.customer}{d.isPos && <span className="text-xs bg-goldsoft text-navy rounded-full px-2 py-0.5 mr-2">POS</span>}</td>
                <td>{Number(d.total).toFixed(2)}{Number(d.discount) > 0 ? <span className="text-[10px] text-[#6C6A82]"> ({Number(d.discountPercent)}%)</span> : null}</td>
                <td>{d.status === 'CONFIRMED' ? <span className="text-green-700 font-bold">{t('approved')}</span> : t('draft')}{d.zatcaKind ? <span className="text-[10px] text-[#6C6A82] mr-1"> {d.zatcaKind}</span> : null}</td>
                <td className="whitespace-nowrap print:hidden">{d.status === 'DRAFT' && <button onClick={() => confirm(d.id)} className="text-xs underline ml-2">{t('approve')}</button>}<button onClick={() => openPdf(`/sales/${d.id}/print`)} className="text-xs underline">{t('print')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SaleTotals({ lines, percent, t }: { lines: DocLine[]; percent: number; t: (k: string) => string }) {
  const gross = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const discount = percent > 0 ? Math.round((gross * percent) / 100 * 100) / 100 : 0;
  const net = Math.round((gross - discount) * 100) / 100;
  const vat = Math.round(net * 15) / 100;
  const total = Math.round((net + vat) * 100) / 100;
  if (percent <= 0) return null;
  return (
    <div className="text-xs text-[#6C6A82] mb-3 space-y-0.5">
      <p>{t('disc.before')}: {gross.toFixed(2)}</p>
      <p>{t('disc.discount')} ({percent}%): {discount.toFixed(2)}</p>
      <p>{t('disc.after')}: {net.toFixed(2)}</p>
      <p>{t('disc.vatOnNet')}: {vat.toFixed(2)}</p>
      <p className="font-bold text-[#1E1B33]">{t('total')}: {total.toFixed(2)}</p>
    </div>
  );
}
