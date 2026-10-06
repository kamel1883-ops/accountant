import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card } from '../components/Layout';
import { ExcelButton, PrintHeader } from '../components/fin';
import { gdate, money, useI18n } from '../i18n';
import { useAuth } from '../context/AuthContext';

function UnsentReport() {
  const { t } = useI18n();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let live = true;
    setErr('');
    api.zatcaUnsent(year, quarter)
      .then((d) => { if (live) setData(d); })
      .catch((e: any) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [year, quarter]);
  const period = `${t('zatca.quarter')} ${quarter} / ${year}`;
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  return (
    <Card>
      <PrintHeader title={t('zatca.unsentTitle')} period={period} />
      <div className="flex items-center justify-between gap-3 mb-1 print:hidden">
        <h3 className="font-bold">{t('zatca.unsentTitle')}</h3>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="text-sm border border-[#E7E5DE] rounded-lg px-4 py-2 font-bold shrink-0">🖨 {t('print')}</button>
          <ExcelButton title={t('zatca.unsentTitle')} />
        </div>
      </div>
      <p className="text-xs text-[#6C6A82] mb-3 print:hidden">{t('zatca.unsentHint')}</p>
      <div className="flex gap-2 mb-3 print:hidden">
        <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[now.getFullYear() - 1, now.getFullYear()].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}>
          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{t('zatca.quarter')} {q}</option>)}
        </select>
      </div>
      {err && <p className="text-red-600 text-sm mb-2">{err}</p>}
      <p className="text-sm font-bold mb-2">{t('zatca.unsentCount')}: {data ? data.count : '—'}</p>
      {data && rows.length === 0 && <p className="text-sm text-[#6C6A82]">{t('zatca.unsentEmpty')}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#6C6A82]">
                <th className="text-start py-1">{t('number')}</th>
                <th className="text-start">{t('zatca.reference')}</th>
                <th className="text-start">{t('customer')}</th>
                <th className="text-start">{t('date')}</th>
                <th className="text-start">{t('total')}</th>
                <th className="text-start">{t('zatca.how')}</th>
                <th className="text-start">{t('zatca.attempts')}</th>
                <th className="text-start">{t('zatca.why')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.invoiceId} className="border-t border-[#E7E5DE] align-top">
                  <td className="py-1 font-bold" dir="ltr">{r.number}{r.docType === 'CREDIT_NOTE' ? ` (${t('zatca.doc.CREDIT_NOTE')})` : ''}</td>
                  <td dir="ltr" className="break-all">{r.reference || '—'}</td>
                  <td>{r.party}</td>
                  <td dir="ltr">{gdate(r.date)}</td>
                  <td dir="ltr">{money(r.total)}</td>
                  <td>{t(`zatca.channel.${r.channel}`)}{r.kind ? ` — ${t(`zatca.kind.${r.kind}`)}` : ''}</td>
                  <td dir="ltr">{r.attempts}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

const emptyForm = {
  environment: 'sandbox', vatNumber: '', orgName: '', orgUnit: '',
  street: '', buildingNumber: '', cityName: '', postalZone: '',
  district: '', businessCategory: '', invoiceType: '1000', crNumber: '',
};

export default function Zatca() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const STEPS = [
    { key: 'NEW', label: t('zatca.step1') },
    { key: 'CSR', label: t('zatca.step2') },
    { key: 'CCSID', label: t('zatca.step3') },
    { key: 'COMPLIANCE', label: t('zatca.step4') },
    { key: 'PCSID', label: t('zatca.step5') },
    { key: 'ACTIVE', label: t('zatca.step6') },
  ];
  const [otp, setOtp] = useState('');
  const [st, setSt] = useState<any>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [prodOk, setProdOk] = useState(false);
  const [f, setF] = useState(emptyForm);
  const [reconfig, setReconfig] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [reason, setReason] = useState('');
  const [allowLegal, setAllowLegal] = useState(false);
  const [pingMsg, setPingMsg] = useState('');

  const load = () => api.zatcaStatus().then((s) => {
    setSt(s);
    if (s?.device) {
      setF((prev) => ({
        ...prev,
        environment: s.device.environment || prev.environment,
        vatNumber: s.device.vatNumber || '',
        orgName: s.device.orgName || '',
        orgUnit: s.device.orgUnit && !/^main branch$/i.test(s.device.orgUnit) ? s.device.orgUnit : '',
        cityName: s.device.cityName || '',
        district: !/^al olaya$/i.test(s.device.district || '') ? (s.device.district || '') : '',
        street: s.device.street && !/king fahd/i.test(s.device.street) ? s.device.street : '',
        buildingNumber: s.device.buildingNumber && s.device.buildingNumber !== '1234' ? s.device.buildingNumber : '',
        postalZone: s.device.postalZone && s.device.postalZone !== '12345' ? s.device.postalZone : '',
        crNumber: s.device.crNumber || '',
        businessCategory: s.device.businessCategory && s.device.businessCategory !== 'Supply of goods' ? s.device.businessCategory : '',
      }));
    }
  }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label); setErr('');
    try {
      await fn();
      setOtp('');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(''); }
  }

  const d = st?.device;
  const locked = !!d?.locked && !reconfig;
  const gateOk = confirmReplace && confirmText.trim() === 'استبدال الشهادة' && reason.trim().length >= 12;
  const fmt = (v?: string) => (v ? new Date(v).toLocaleString('en-GB') : '—');
  const last = st?.submissions?.[0];
  const lastLabel = !last ? t('zatca.sendNone') : last.status === 'OK' ? t('zatca.sendOk') : t('zatca.sendFail');
  const expirySoon = d?.certExpiresAt && (new Date(d.certExpiresAt).getTime() - Date.now()) < 30 * 24 * 3600 * 1000;
  const inp = 'border border-[#E7E5DE] rounded-lg p-2 text-sm w-full';

  function downloadReport() {
    const lines = [
      `${t('zatca.title')} — ${t('brand')}`,
      `${t('zatca.linkState')}: ${d?.status === 'ACTIVE' ? t('zatca.activeState') : (d?.status || '—')}`,
      `${t('zatca.env')}: ${d?.environment ? t(`zatca.${d.environment}`) : '—'}`,
      `${t('zatca.orgName')}: ${d?.orgName || '—'}`,
      `${t('zatca.vatMasked')}: ****${d?.vatLast4 || ''}`,
      `${t('zatca.unit')}: ${d?.orgUnit || '—'}`,
      `${t('zatca.certState')}: ${d?.certificateStatus === 'active' ? t('zatca.certOn') : '—'}`,
      `${t('zatca.issued')}: ${fmt(d?.certIssuedAt)}`,
      `${t('zatca.expires')}: ${fmt(d?.certExpiresAt)}${d?.certExpiryEstimated ? ` (${t('zatca.estimated')})` : ''}`,
      `${t('zatca.lastSend')}: ${lastLabel}`,
      `${t('zatca.lastInvoice')}: ${last?.invoiceId || (last ? fmt(last.createdAt) : '—')}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'jadara-zatca-status.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (locked) {
    return (
      <div>
        <UnsentReport />
        <div className="print:hidden">
        <h2 className="text-xl font-bold mb-1">{t('zatca.title')}</h2>
        <p className="text-sm font-bold text-green-800 mb-1">{t('zatca.linkedTitle')}</p>
        <p className="text-sm text-[#6C6A82] mb-4">{t('zatca.linkedBody')}</p>
        {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
        {pingMsg && <p className="text-sm mb-3">{pingMsg}</p>}
        {expirySoon && <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">{t('zatca.expirySoon')}</p>}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <p><b>{t('zatca.linkState')}:</b> {d.status === 'ACTIVE' ? t('zatca.activeState') : d.status}</p>
            <p><b>{t('zatca.env')}:</b> {t(`zatca.${d.environment}`)}</p>
            <p><b>{t('zatca.orgName')}:</b> {d.orgName}</p>
            <p><b>{t('zatca.vatMasked')}:</b> {'****' + (d.vatLast4 || '')}</p>
            <p><b>{t('zatca.unit')}:</b> {d.orgUnit}</p>
            <p><b>{t('zatca.certState')}:</b> {d.certificateStatus === 'active' ? t('zatca.certOn') : '—'}</p>
            <p><b>{t('zatca.issued')}:</b> {fmt(d.certIssuedAt)}</p>
            <p><b>{t('zatca.expires')}:</b> {fmt(d.certExpiresAt)}{d.certExpiryEstimated ? ` (${t('zatca.estimated')})` : ''}</p>
            <p><b>{t('zatca.lastSend')}:</b> {lastLabel}</p>
            <p><b>{t('zatca.lastInvoice')}:</b> {last?.invoiceId || (last ? fmt(last.createdAt) : '—')}</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button disabled={!!busy} onClick={() => run('refresh', () => api.zatcaStatus().then((s) => { setSt(s); return s; }))} className="border border-[#E7E5DE] rounded-lg px-3 py-2 text-sm">{busy === 'refresh' ? '...' : t('zatca.refresh')}</button>
            <button disabled={!!busy} onClick={() => run('ping', () => api.zatcaPing().then((r) => { setPingMsg(r.message || ''); return r; }))} className="border border-[#E7E5DE] rounded-lg px-3 py-2 text-sm">{busy === 'ping' ? '...' : t('zatca.ping')}</button>
            <button onClick={downloadReport} className="border border-[#E7E5DE] rounded-lg px-3 py-2 text-sm">{t('zatca.report')}</button>
          </div>
          <p className="text-xs text-[#6C6A82] mt-3">{t('zatca.salesHint')}</p>
          <p className="text-xs text-[#6C6A82] mt-1">{t('zatca.supportHint')}</p>
        </Card>
        {isAdmin && (
          <Card>
            <button onClick={() => { setReconfig(true); setErr(''); setPingMsg(''); }} className="border border-amber-400 text-amber-900 rounded-lg px-4 py-2 text-sm">{t('zatca.reopen')}</button>
          </Card>
        )}
        {st?.submissions?.length > 0 && (
          <Card>
            <h3 className="font-bold mb-2">{t('zatca.log')}</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-[#6C6A82]"><th className="text-right py-1">{t('date')}</th><th className="text-right">{t('type')}</th><th className="text-right">{t('zatca.status')}</th><th className="text-right">HTTP</th></tr></thead>
              <tbody>
                {st.submissions.map((s: any) => (
                  <tr key={s.id} className="border-t border-[#E7E5DE]">
                    <td className="py-1">{fmt(s.createdAt)}</td>
                    <td>{s.kind}</td>
                    <td>{s.status === 'OK' ? t('zatca.sendOk') : s.status === 'FAILED' ? t('zatca.sendFail') : s.status}</td>
                    <td>{s.httpStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        {isAdmin && st?.audits?.length > 0 && (
          <Card>
            <h3 className="font-bold mb-2">{t('zatca.audit')}</h3>
            <table className="w-full text-xs">
              <thead><tr className="text-[#6C6A82]"><th className="text-right py-1">{t('date')}</th><th className="text-right">{t('type')}</th><th className="text-right">{t('zatca.reason')}</th></tr></thead>
              <tbody>
                {st.audits.map((a: any) => (
                  <tr key={a.id} className="border-t border-[#E7E5DE]">
                    <td className="py-1">{fmt(a.createdAt)} — {a.actor}</td>
                    <td>{a.action}</td>
                    <td>{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        </div>
      </div>
    );
  }

  if (d?.locked && reconfig) {
    const body = {
      ...f,
      environment: allowLegal ? f.environment : d.environment,
      vatNumber: allowLegal ? f.vatNumber : (d.vatNumber || f.vatNumber),
      orgName: allowLegal ? f.orgName : d.orgName,
      orgUnit: allowLegal ? f.orgUnit : d.orgUnit,
      street: f.street || d.street,
      buildingNumber: f.buildingNumber || d.buildingNumber,
      cityName: f.cityName || d.cityName,
      postalZone: f.postalZone || d.postalZone,
      district: f.district || d.district,
      businessCategory: f.businessCategory || d.businessCategory,
      crNumber: f.crNumber || d.crNumber || '',
      otp,
      reset: true,
      confirmReplace,
      confirmText: confirmText.trim(),
      reason: reason.trim(),
      allowLegalChange: allowLegal,
    };
    return (
      <div>
        <h2 className="text-xl font-bold mb-1">{t('zatca.title')}</h2>
        <p className="text-sm font-bold text-amber-900 mb-1">{t('zatca.reopen')}</p>
        <p className="text-sm text-[#6C6A82] mb-3">{t('zatca.reopenWarn')}</p>
        {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
        <Card>
          <label className="text-xs flex gap-2 items-start mb-2">
            <input type="checkbox" checked={confirmReplace} onChange={(e) => setConfirmReplace(e.target.checked)} />
            <span>{t('zatca.confirm1')}</span>
          </label>
          <input className={inp + ' mb-2'} placeholder={t('zatca.confirm2')} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoComplete="off" />
          <input className={inp + ' mb-2'} placeholder={t('zatca.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <label className="text-xs flex gap-2 items-start mb-3">
            <input type="checkbox" checked={allowLegal} onChange={(e) => setAllowLegal(e.target.checked)} />
            <span>{t('zatca.legalChange')}</span>
          </label>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <select className={inp} disabled={!allowLegal} value={allowLegal ? f.environment : d.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}>
              <option value="sandbox">{t('zatca.sandbox')}</option>
              <option value="simulation">{t('zatca.simulation')}</option>
              <option value="production">{t('zatca.production')}</option>
            </select>
            <input className={inp} disabled={!allowLegal} placeholder={t('zatca.vat')} value={allowLegal ? f.vatNumber : ('****' + (d.vatLast4 || ''))} onChange={(e) => setF({ ...f, vatNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })} />
            <input className={inp} disabled={!allowLegal} placeholder={t('zatca.org')} value={allowLegal ? f.orgName : d.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} />
            <input className={inp} disabled={!allowLegal} placeholder={t('zatca.unit')} value={allowLegal ? f.orgUnit : d.orgUnit} onChange={(e) => setF({ ...f, orgUnit: e.target.value })} />
          </div>
          <p className="text-xs text-[#6C6A82] mb-2">{t('zatca.otpHint')}</p>
          <input className={inp + ' mb-3'} style={{ maxWidth: 220 }} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" autoComplete="off" />
          <div className="flex flex-wrap gap-2">
            <button disabled={!gateOk || !!busy || otp.trim().length === 0} onClick={() => run('renew', async () => {
              const r = await api.zatcaRenew(body);
              setReconfig(false);
              return r;
            })} className="bg-navy text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'renew' ? '...' : t('zatca.doRenew')}</button>
            <button disabled={!gateOk || !!busy || otp.trim().length === 0} onClick={() => {
              if (!window.confirm(t('zatca.reopenWarn'))) return;
              run('connect', async () => {
                const r = await api.zatcaConnect(body);
                setReconfig(false);
                return r;
              });
            }} className="border border-amber-500 text-amber-900 rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'connect' ? '...' : t('zatca.doReconfig')}</button>
            <button onClick={() => { setReconfig(false); setOtp(''); setConfirmText(''); }} className="border border-[#E7E5DE] rounded-lg px-4 py-2 text-sm">{t('zatca.cancelReconfig')}</button>
          </div>
        </Card>
      </div>
    );
  }

  const complete = f.vatNumber.length === 15 && f.orgName.trim() && f.orgUnit.trim() && f.cityName.trim()
    && f.district.trim() && f.street.trim() && f.buildingNumber.trim() && /^\d{5}$/.test(f.postalZone) && f.businessCategory.trim();
  const otpOk = f.environment === 'sandbox' ? true : otp.trim().length > 0 && otp.trim() !== '123345';

  return (
    <div>
      <div className="print:hidden">
      <h2 className="text-xl font-bold mb-1">{t('zatca.title')}</h2>
      <p className="text-sm text-[#6C6A82] mb-2">{t('zatca.sub')}</p>
      <p className="text-xs text-[#6C6A82] mb-4">{t('zatca.howto')}</p>

      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        {STEPS.map((s) => (
          <span key={s.key} className={`px-2 py-1 rounded-lg border ${d?.status === s.key || (s.key === 'ACTIVE' && d?.status === 'ACTIVE') ? 'bg-navy text-white border-navy' : 'border-[#E7E5DE]'}`}>{s.label}</span>
        ))}
      </div>
      {err && <p className="text-red-600 text-sm mb-3">{err}</p>}
      {d?.lastError && <p className="text-red-600 text-xs mb-3 whitespace-pre-wrap">{d.lastError}</p>}
      <p className="text-sm mb-3">
        <b>{t(`zatca.phase.${d?.phase || 'not_configured'}`)}</b>
        {d && <span className="text-xs text-[#6C6A82]"> — {t('zatca.env')}: {t(`zatca.${d.environment}`)} — {d.vatNumber || '—'}</span>}
      </p>
      {d?.apiBase && <p className="text-[11px] text-[#6C6A82] mb-3 font-mono break-all">{d.apiBase}</p>}
      {f.environment !== 'production' && (
        <p className="text-xs bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3">{t('zatca.notLive')}</p>
      )}
      {!isAdmin && <p className="text-xs text-[#6C6A82] mb-3">{t('zatca.adminOnly')}</p>}
      {f.environment === 'production' && (
        <label className="text-xs flex gap-2 items-start mb-3">
          <input type="checkbox" checked={prodOk} onChange={(e) => setProdOk(e.target.checked)} />
          <span>{t('zatca.prodLegal')}</span>
        </label>
      )}

      <Card>
        <h3 className="font-bold mb-3">{t('zatca.step1')}</h3>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <select className={inp} value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}>
            <option value="sandbox">{t('zatca.sandbox')}</option>
            <option value="simulation">{t('zatca.simulation')}</option>
            {isAdmin && <option value="production">{t('zatca.production')}</option>}
          </select>
          <input className={inp} placeholder={t('zatca.vat')} value={f.vatNumber} onChange={(e) => setF({ ...f, vatNumber: e.target.value.replace(/\D/g, '').slice(0, 15) })} />
          <input className={inp} placeholder={t('zatca.org')} value={f.orgName} onChange={(e) => setF({ ...f, orgName: e.target.value })} />
          <input className={inp} placeholder={t('zatca.unit')} value={f.orgUnit} onChange={(e) => setF({ ...f, orgUnit: e.target.value })} />
          <input className={inp} placeholder={t('zatca.street')} value={f.street} onChange={(e) => setF({ ...f, street: e.target.value })} />
          <input className={inp} placeholder={t('zatca.building')} value={f.buildingNumber} onChange={(e) => setF({ ...f, buildingNumber: e.target.value })} />
          <input className={inp} placeholder={t('zatca.city')} value={f.cityName} onChange={(e) => setF({ ...f, cityName: e.target.value })} />
          <input className={inp} placeholder={t('zatca.district')} value={f.district} onChange={(e) => setF({ ...f, district: e.target.value })} />
          <input className={inp} placeholder={t('zatca.postal')} value={f.postalZone} onChange={(e) => setF({ ...f, postalZone: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
          <input className={inp} placeholder={t('zatca.activity')} value={f.businessCategory} onChange={(e) => setF({ ...f, businessCategory: e.target.value })} />
          <input className={inp} placeholder={t('zatca.cr')} value={f.crNumber} onChange={(e) => setF({ ...f, crNumber: e.target.value })} />
        </div>
        <button disabled={!isAdmin || !!busy} onClick={() => {
          if (!complete) { setErr(t('zatca.needVat')); return; }
          if (f.environment === 'production' && !prodOk) { setErr(t('zatca.prodLegal')); return; }
          if (d?.status === 'ACTIVE' && !window.confirm(t('zatca.resetConfirm'))) return;
          run('csr', () => api.zatcaSetup({ ...f, reset: d?.status === 'ACTIVE' }));
        }} className="bg-navy text-white rounded-lg px-4 py-2 text-sm">{busy === 'csr' ? '...' : t('zatca.csrBtn')}</button>
        <button disabled={!isAdmin || !!busy} onClick={() => {
          if (!complete) { setErr(t('zatca.needVat')); return; }
          if (!otpOk) { setErr(t('zatca.otpHint')); return; }
          if (f.environment === 'production' && !prodOk) { setErr(t('zatca.prodLegal')); return; }
          if (d?.status === 'ACTIVE' && !window.confirm(t('zatca.resetConfirm'))) return;
          run('connect', () => api.zatcaConnect({ ...f, otp, reset: d?.status === 'ACTIVE' }));
        }} className="mr-2 bg-green-700 text-white rounded-lg px-4 py-2 text-sm">{busy === 'connect' ? '...' : t('zatca.connect')}</button>
      </Card>

      <Card>
        <h3 className="font-bold mb-2 mt-4">{t('zatca.step3')}</h3>
        <p className="text-xs text-[#6C6A82] mb-2">{t('zatca.otpHint')}</p>
        <div className="flex gap-2">
          <input className={inp} style={{ maxWidth: 160 }} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" autoComplete="off" />
          <button disabled={!isAdmin || !!busy} onClick={() => {
            if (!otpOk) { setErr(t('zatca.otpHint')); return; }
            run('ccsid', () => api.zatcaCcsid(otp));
          }} className="border border-[#E7E5DE] rounded-lg px-4 text-sm">{busy === 'ccsid' ? '...' : t('zatca.ccsid')}</button>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-2 mt-4">{t('zatca.step4')}</h3>
        <p className="text-xs text-[#6C6A82] mb-2">{t('zatca.six')}</p>
        <button disabled={!isAdmin || !!busy} onClick={() => run('cmp', () => api.zatcaComplianceInvoices())} className="border border-[#E7E5DE] rounded-lg px-4 py-2 text-sm">{busy === 'cmp' ? '...' : t('zatca.sendSix')}</button>
      </Card>

      <Card>
        <h3 className="font-bold mb-2 mt-4">{t('zatca.step5')}</h3>
        <div className="flex gap-2 flex-wrap">
          <button disabled={!isAdmin || !!busy || d?.status !== 'COMPLIANCE'} onClick={() => run('pcsid', () => api.zatcaPcsid())} className="bg-navy text-white rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'pcsid' ? '...' : t('zatca.pcsid')}</button>
          <button disabled={!isAdmin || !!busy} onClick={() => {
            if (!otpOk) { setErr(t('zatca.otpHint')); return; }
            run('renew', () => api.zatcaRenew({ otp }));
          }} className="border border-[#E7E5DE] rounded-lg px-4 py-2 text-sm">{busy === 'renew' ? '...' : t('zatca.renew')}</button>
          <button disabled={!isAdmin || !!busy || d?.status !== 'ACTIVE' || d?.environment === 'production'} onClick={() => run('test', () => api.zatcaTestSend())} className="border border-green-700 text-green-800 rounded-lg px-4 py-2 text-sm disabled:opacity-50">{busy === 'test' ? '...' : t('zatca.test')}</button>
        </div>
        {d?.status === 'ACTIVE' && <p className="text-green-700 text-sm mt-2">{d.environment === 'production' ? t('zatca.active') : t('zatca.activeTest')}</p>}
      </Card>

      {st?.submissions?.length > 0 && (
        <Card>
          <h3 className="font-bold mb-2 mt-4">{t('zatca.log')}</h3>
          <table className="w-full text-xs">
            <thead><tr className="text-[#6C6A82]"><th className="text-right py-1">{t('date')}</th><th className="text-right">{t('type')}</th><th className="text-right">{t('zatca.status')}</th><th className="text-right">HTTP</th></tr></thead>
            <tbody>
              {st.submissions.map((s: any) => (
                <tr key={s.id} className="border-t border-[#E7E5DE]">
                  <td className="py-1">{new Date(s.createdAt).toLocaleString('en-GB')}</td>
                  <td>{s.kind}</td>
                  <td>{s.status}</td>
                  <td>{s.httpStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      </div>
      <UnsentReport />
    </div>
  );
}
