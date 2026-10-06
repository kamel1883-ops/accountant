import React, { useEffect, useState } from 'react';
import { api, downloadSupportFile, openPdf } from '../api/client';
import { Card } from '../components/Layout';
import { PrintBar } from '../components/fin';
import { useI18n } from '../i18n';
import { LineItemsEditor, DocLine } from '../components/LineItemsEditor';
import { CostCenterSelect } from '../components/CostCenterSelect';

const TYPE_KEYS = ['REQUEST', 'ORDER', 'INVOICE', 'RETURN'];

export default function Purchases() {
  const { t, lang } = useI18n();
  const [type, setType] = useState('INVOICE');
  const [docs, setDocs] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [supplier, setSupplier] = useState('');
  const [supplierVat, setSupplierVat] = useState('');
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [receiptStatus, setReceiptStatus] = useState('FULL');
  const [paymentStatus, setPaymentStatus] = useState('CREDIT');
  const [file, setFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [lines, setLines] = useState<DocLine[]>([{ productId: '', quantity: '1', unitPrice: '' }]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function reload() {
    void api.getPurchaseDocs(type)
      .then((d) => setDocs(Array.isArray(d) ? d : []))
      .catch((err: any) => setError(err.message));
  }
  useEffect(() => { reload(); }, [type]);
  useEffect(() => {
    api.getProducts().then((d) => setProducts(Array.isArray(d) ? d : [])).catch(() => setProducts([]));
    api.getWarehouses().then((d) => setWarehouses(Array.isArray(d) ? d : [])).catch(() => setWarehouses([]));
  }, []);

  function resetForm() {
    setSupplier(''); setSupplierVat(''); setSupplierInvoiceNo(''); setOrderRef(''); setInvoiceDate('');
    setReceiptStatus('FULL'); setPaymentStatus('CREDIT'); setFile(null); setEditingId(''); setCostCenterId('');
    setLines([{ productId: '', quantity: '1', unitPrice: '' }]);
  }

  async function filePayload() {
    if (!file) return undefined;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
      reader.onerror = () => reject(new Error('file'));
      reader.readAsDataURL(file);
    });
    return { filename: file.name, mime: file.type || 'application/octet-stream', data };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsedLines = lines.filter((l) => l.productId && l.quantity).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) || 0 }));
    if (!supplier || parsedLines.length === 0) { setError(t('supplierName')); return; }
    const body = {
      type, supplier, warehouseId: warehouseId || undefined, costCenterId: costCenterId || undefined, lines: parsedLines,
      supplierVat, supplierInvoiceNo, orderRef, date: invoiceDate || undefined,
      receiptStatus, paymentStatus, file: await filePayload(),
    };
    try {
      if (editingId) await api.updatePurchaseDoc(editingId, body);
      else await api.addPurchaseDoc(body);
      resetForm();
      reload();
    } catch (err: any) { setError(err.message); }
  }

  function edit(doc: any) {
    setEditingId(doc.id);
    setSupplier(doc.supplier || '');
    setSupplierVat(doc.supplierVat || '');
    setSupplierInvoiceNo(doc.supplierInvoiceNo || '');
    setOrderRef(doc.orderRef || '');
    setInvoiceDate(doc.date ? String(doc.date).slice(0, 10) : '');
    setReceiptStatus(doc.receiptStatus || 'FULL');
    setPaymentStatus(doc.paymentStatus || 'CREDIT');
    setWarehouseId(doc.warehouseId || '');
    setCostCenterId(doc.costCenterId || '');
    setLines((doc.lines || []).map((l: any) => ({ productId: l.productId, quantity: String(l.quantity), unitPrice: String(l.unitPrice) })));
    setFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function confirm(id: string) {
    try { await api.confirmPurchaseDoc(id); reload(); } catch (err: any) { alert(err.message); }
  }

  async function toInvoice(doc: any) {
    setNotice('');
    try {
      await api.purchaseInvoiceFrom(doc.id, doc.warehouseId || warehouseId || undefined);
      setNotice(t('pur.invoiceReady'));
      setType('INVOICE');
    } catch (err: any) { alert(err.message); }
  }

  const operational = type === 'REQUEST' || type === 'ORDER';
  const incoming = type === 'INVOICE' || type === 'RETURN';

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('pur.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('pur.sub')}</p>
      <PrintBar title={`${t('pur.title')} — ${t(`pdoc.${type}`)}`} excel={false} />

      <div className="flex gap-2 mb-4 flex-wrap print:hidden">
        {TYPE_KEYS.map((k) => <button key={k} onClick={() => setType(k)} className={`text-sm px-4 py-1.5 rounded-lg ${type === k ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{t(`pdoc.${k}`)}</button>)}
      </div>
      {type === 'ORDER' && <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('pur.orderHint')}</p>}
      {type === 'REQUEST' && <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('pur.requestHint')}</p>}
      {notice && <p className="text-sm text-green-700 mb-4 print:hidden">{notice}</p>}

      <Card className="print:hidden">
        <form onSubmit={submit}>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('supplierName')} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
              <option value="">{t('selectWarehouse')}</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{lang === 'en' ? w.nameEn || w.nameAr : w.nameAr}</option>)}
            </select>
            <CostCenterSelect value={costCenterId} onChange={(id, center) => { setCostCenterId(id); if (center?.defaultWarehouseId) setWarehouseId(center.defaultWarehouseId); }} />
            {incoming && (
              <>
                <input dir="ltr" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('pur.supplierVat')} value={supplierVat} onChange={(e) => setSupplierVat(e.target.value)} />
                <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('pur.supplierNo')} value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} />
                <label className="text-xs text-[#6C6A82]">{t('pur.supplierDate')}
                  <input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm block w-full mt-1" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                </label>
                <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('pur.orderRef')} value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
                <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={receiptStatus} onChange={(e) => setReceiptStatus(e.target.value)}>
                  <option value="FULL">{t('pur.receiptFull')}</option>
                  <option value="PARTIAL">{t('pur.receiptPartial')}</option>
                </select>
                <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
                  <option value="CREDIT">{t('pur.payCredit')}</option>
                  <option value="PAID">{t('pur.payPaid')}</option>
                </select>
              </>
            )}
          </div>
          {incoming && (
            <div className="mb-3">
              <p className="text-xs text-[#6C6A82] mb-1">{t('pur.payHint')}</p>
              <label className="text-xs text-[#6C6A82] block mb-1">{t('pur.file')}</label>
              <input type="file" accept=".pdf,.xml,image/jpeg,image/png,image/webp" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
          )}
          <LineItemsEditor products={products} lines={lines} setLines={setLines} priceFrom="cost" />
          {error && <p className="text-red-600 text-xs mb-2">{error}</p>}
          <button className="bg-gold text-navy font-bold rounded-lg py-2 px-5 text-sm">{t('saveDraft')}</button>
        </form>
      </Card>

      <Card>
        <table className="w-full text-sm">
          <thead><tr className="text-[#6C6A82] text-xs"><th className="text-start py-1">{t('supplier')}</th><th className="text-start">{t('total')}</th><th className="text-start">{t('status')}</th><th className="text-start print:hidden">{t('actions')}</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-t border-[#E7E5DE]">
                <td className="py-1.5">{d.supplier}{d.supplierInvoiceNo && <div className="text-xs text-[#6C6A82]">{d.supplierInvoiceNo}</div>}</td>
                <td>{Number(d.total).toFixed(2)}</td>
                <td>{d.status === 'CONFIRMED' ? <span className="text-green-700 font-bold">{t('approved')}</span> : t('draft')}{incoming && <div className="text-xs text-[#6C6A82]">{d.receiptStatus === 'PARTIAL' ? t('pur.receiptPartial') : t('pur.receiptFull')} · {d.paymentStatus === 'PAID' ? t('pur.payPaid') : t('pur.payCredit')}</div>}</td>
                <td className="whitespace-nowrap print:hidden">
                  {d.status === 'DRAFT' && <button type="button" onClick={() => edit(d)} className="text-xs underline ml-2">{t('pur.edit')}</button>}
                  {d.status === 'DRAFT' && <button type="button" onClick={() => confirm(d.id)} className="text-xs underline ml-2">{operational ? t('pur.lock') : t('approve')}</button>}
                  {operational && <button type="button" onClick={() => toInvoice(d)} className="text-xs underline ml-2">{t('pur.toInvoice')}</button>}
                  {d.attachmentName && <button type="button" onClick={() => downloadSupportFile(`/purchases/${d.id}/file`, d.attachmentName).catch((err: any) => alert(err.message))} className="text-xs underline ml-2">{t('pur.fileLink')}</button>}
                  <button type="button" onClick={() => openPdf(`/purchases/${d.id}/print`)} className="text-xs underline">{t('print')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
