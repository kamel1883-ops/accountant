import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import { Card, Kpi } from '../components/Layout';
import { PrintHeader, money, gdate } from '../components/fin';
import { CostCenterSelect } from '../components/CostCenterSelect';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';

function tone(status: string) {
  if (status === 'AUTO' || status === 'MANUAL') return 'text-emerald-700';
  if (status === 'EXCLUDED') return 'text-[#6C6A82]';
  return 'text-red-700';
}

export default function Reconcile() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [tab, setTab] = useState('board');
  const [summary, setSummary] = useState<any>(null);
  const [treasuries, setTreasuries] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [sheet, setSheet] = useState<any>(null);
  const [error, setError] = useState('');
  const [bank, setBank] = useState({ treasuryId: '', periodFrom: '', periodTo: '', externalOpening: '', externalClosing: '', csv: '', costCenterId: '', segregation: false });
  const [cash, setCash] = useState({ treasuryId: '', periodTo: '', counted: '', custodianName: '', costCenterId: '', segregation: false });
  const [pickedBook, setPickedBook] = useState<string[]>([]);
  const [pickedStmt, setPickedStmt] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [ledgerCode, setLedgerCode] = useState('1102');
  const [ledger, setLedger] = useState<any>(null);
  const [parties, setParties] = useState<any>(null);
  const [stockTie, setStockTie] = useState<any>(null);
  const [vatTie, setVatTie] = useState<any>(null);
  const [partyForm, setPartyForm] = useState({ party: '', externalClosing: '', csv: '', periodFrom: '', periodTo: '' });

  function loadBoard() {
    api.reconcileSummary().then(setSummary).catch((e: any) => setError(e.message));
  }
  useEffect(() => {
    loadBoard();
    api.getTreasuries().then((d) => setTreasuries(Array.isArray(d) ? d : [])).catch(() => setTreasuries([]));
    api.getAccounts().then((d) => setAccounts(Array.isArray(d) ? d.filter((a: any) => !a.isGroup) : [])).catch(() => setAccounts([]));
  }, []);
  useEffect(() => {
    if (tab === 'customers' || tab === 'suppliers') {
      api.getPartyControl(tab === 'customers' ? 'CUSTOMER' : 'SUPPLIER').then(setParties).catch((e: any) => setError(e.message));
    }
    if (tab === 'inventory') api.reconcileInventory().then(setStockTie).catch((e: any) => setError(e.message));
    if (tab === 'vat') api.reconcileVat().then(setVatTie).catch((e: any) => setError(e.message));
  }, [tab]);

  async function openBank(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const row = await api.startBankRec({ ...bank, externalOpening: Number(bank.externalOpening || 0), externalClosing: Number(bank.externalClosing || 0), costCenterId: bank.costCenterId || undefined });
      setSheet(row);
      loadBoard();
    } catch (err: any) { setError(err.message); }
  }

  async function openCash(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const row = await api.startCashRec({ ...cash, counted: Number(cash.counted), costCenterId: cash.costCenterId || undefined });
      setSheet(row);
      setTab('cash');
      loadBoard();
    } catch (err: any) { setError(err.message); }
  }

  const tabs = [
    ['board', t('rec.board')],
    ['bank', t('rec.bank')],
    ['cash', t('rec.cash')],
    ['customers', t('rec.customers')],
    ['suppliers', t('rec.suppliers')],
    ['inventory', t('rec.inventory')],
    ['vat', t('rec.vat')],
    ['statement', t('rec.statement')],
  ];
  const pos = sheet?.position || {};

  return (
    <div>
      <h2 className="text-xl font-bold mb-1 print:hidden">{t('nav.reconcile')}</h2>
      <p className="text-sm text-[#6C6A82] mb-4 print:hidden">{t('rec.sub')}</p>
      <div className="flex gap-2 mb-4 flex-wrap print:hidden">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`text-sm px-4 py-1.5 rounded-lg ${tab === key ? 'bg-navy text-white' : 'border border-[#E7E5DE]'}`}>{label}</button>
        ))}
      </div>
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {tab === 'board' && summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Kpi label={t('rec.open')} value={String(summary.open)} />
            <Kpi label={t('rec.approvedMonth')} value={String(summary.approvedThisMonth)} />
            <Kpi label={t('rec.diff')} value={money(summary.difference)} />
            <Kpi label={t('rec.unmatched')} value={String(summary.unmatched)} />
          </div>
          <Card>
            <p className="text-xs text-[#6C6A82] mb-2">0–30: {summary.ages['0-30']} · 31–60: {summary.ages['31-60']} · 61–90: {summary.ages['61-90']} · +90: {summary.ages['90+']}</p>
            <table className="w-full text-sm">
              <tbody>
                {(summary.recent || []).map((r: any) => (
                  <tr key={r.id} className="border-t border-[#E7E5DE]">
                    <td className="py-1.5">{r.kind === 'BANK' ? t('rec.bank') : t('rec.cash')}</td>
                    <td>{r.accountCode}</td>
                    <td>{gdate(r.periodTo)}</td>
                    <td>{money(r.difference)}</td>
                    <td>{r.status}</td>
                    <td><button type="button" className="text-xs underline" onClick={() => api.getReconciliation(r.id).then((row) => { setSheet(row); setTab(r.kind === 'BANK' ? 'bank' : 'cash'); }).catch((e: any) => setError(e.message))}>{t('rec.statement')}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {tab === 'bank' && (
        <Card className="print:hidden">
          <form onSubmit={openBank} className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={bank.treasuryId} onChange={(e) => setBank({ ...bank, treasuryId: e.target.value })}>
              <option value="">{t('rec.bank')}</option>
              {treasuries.filter((x) => x.type === 'BANK').map((x) => <option key={x.id} value={x.id}>{x.nameAr} · {x.accountCode}</option>)}
            </select>
            <input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={bank.periodFrom} onChange={(e) => setBank({ ...bank, periodFrom: e.target.value })} />
            <input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={bank.periodTo} onChange={(e) => setBank({ ...bank, periodTo: e.target.value })} />
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.opening')} value={bank.externalOpening} onChange={(e) => setBank({ ...bank, externalOpening: e.target.value })} />
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.closing')} value={bank.externalClosing} onChange={(e) => setBank({ ...bank, externalClosing: e.target.value })} />
            <CostCenterSelect value={bank.costCenterId} onChange={(id) => setBank({ ...bank, costCenterId: id })} />
            <textarea className="col-span-2 md:col-span-3 border border-[#E7E5DE] rounded-lg p-2 text-sm" rows={4} placeholder={t('rec.csv')} value={bank.csv} onChange={(e) => setBank({ ...bank, csv: e.target.value })} />
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={bank.segregation} onChange={(e) => setBank({ ...bank, segregation: e.target.checked })} />{t('rec.seg')}</label>
            <button className="bg-gold text-navy font-bold rounded-lg text-sm">{t('rec.openRec')}</button>
          </form>
        </Card>
      )}

      {tab === 'cash' && (
        <Card className="print:hidden">
          <form onSubmit={openCash} className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={cash.treasuryId} onChange={(e) => setCash({ ...cash, treasuryId: e.target.value })}>
              <option value="">{t('rec.cash')}</option>
              {treasuries.filter((x) => x.type === 'CASH').map((x) => <option key={x.id} value={x.id}>{x.nameAr} · {x.accountCode}</option>)}
            </select>
            <input type="date" className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={cash.periodTo} onChange={(e) => setCash({ ...cash, periodTo: e.target.value })} />
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.counted')} value={cash.counted} onChange={(e) => setCash({ ...cash, counted: e.target.value })} />
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.custodian')} value={cash.custodianName} onChange={(e) => setCash({ ...cash, custodianName: e.target.value })} />
            <CostCenterSelect value={cash.costCenterId} onChange={(id) => setCash({ ...cash, costCenterId: id })} />
            <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={cash.segregation} onChange={(e) => setCash({ ...cash, segregation: e.target.checked })} />{t('rec.seg')}</label>
            <button className="bg-gold text-navy font-bold rounded-lg text-sm">{t('rec.openRec')}</button>
          </form>
        </Card>
      )}

      {sheet && (tab === 'bank' || tab === 'cash' || tab === 'customers' || tab === 'suppliers') && (
        <Card>
          <PrintHeader title={t('nav.reconcile')} />
          <div className="flex flex-wrap gap-4 text-sm mb-3">
            <span>{t('rec.bookBal')}: <b>{money(sheet.bookBalance)}</b></span>
            <span>{t('rec.stmtBal')}: <b>{money(sheet.externalClosing)}</b></span>
            <span>{t('rec.raw')}: <b>{money(pos.rawDifference ?? pos.difference)}</b></span>
            <span className={Math.abs(sheet.blockingDifference) < 0.02 ? 'text-emerald-700' : 'text-red-700'}>
              {Math.abs(sheet.blockingDifference) < 0.02 ? t('rec.matched') : t('rec.gap')}: <b>{money(sheet.blockingDifference)}</b>
            </span>
          </div>
          {sheet.kind === 'BANK' && (
            <p className="text-xs text-[#6C6A82] mb-3">{t('rec.transit')} {money(pos.depositsInTransit)} · {t('rec.outstanding')} {money(pos.outstanding)} · {t('rec.fee')} {money((pos.unrecordedIn || 0) + (pos.unrecordedOut || 0))}</p>
          )}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-sm mb-1">{t('rec.books')}</h3>
              {(sheet.book || []).map((l: any) => (
                <label key={l.id} className={`flex gap-2 text-sm py-1 border-t border-[#E7E5DE] ${tone(l.matchStatus)}`}>
                  <input type="checkbox" checked={pickedBook.includes(l.id)} onChange={(e) => setPickedBook(e.target.checked ? [...pickedBook, l.id] : pickedBook.filter((id) => id !== l.id))} />
                  <span>{gdate(l.date)} · {l.description} · {money(l.amount)}</span>
                </label>
              ))}
            </div>
            <div>
              <h3 className="font-bold text-sm mb-1">{t('rec.external')}</h3>
              {(sheet.statement || []).map((l: any) => (
                <label key={l.id} className={`flex gap-2 text-sm py-1 border-t border-[#E7E5DE] ${tone(l.matchStatus)}`}>
                  <input type="checkbox" checked={pickedStmt.includes(l.id)} onChange={(e) => setPickedStmt(e.target.checked ? [...pickedStmt, l.id] : pickedStmt.filter((id) => id !== l.id))} />
                  <span>{gdate(l.date)} · {l.description} · {money(l.amount)}</span>
                </label>
              ))}
            </div>
          </div>
          {(sheet.suggestions || []).length > 0 && (
            <div className="mt-3 text-sm">
              <h3 className="font-bold">{t('rec.suggest')}</h3>
              {sheet.suggestions.map((s: any, i: number) => (
                <p key={i}>{t('debit')} {s.debitAccount} {money(s.amount)} / {t('credit')} {s.creditAccount} {money(s.amount)} — {s.reason}</p>
              ))}
            </div>
          )}
          {sheet.status !== 'APPROVED' && (
            <div className="flex flex-wrap gap-2 mt-3 print:hidden">
              <button type="button" className="text-sm border rounded-lg px-3 py-1.5" onClick={() => api.matchReconciliation(sheet.id, { bookIds: pickedBook, statementIds: pickedStmt }).then(setSheet).catch((e: any) => setError(e.message))}>{t('rec.match')}</button>
              <button type="button" className="text-sm border rounded-lg px-3 py-1.5" onClick={() => {
                const group = [...(sheet.book || []), ...(sheet.statement || [])].find((l) => pickedBook.includes(l.id) || pickedStmt.includes(l.id))?.matchGroupId;
                if (group) api.unmatchReconciliation(sheet.id, group).then(setSheet).catch((e: any) => setError(e.message));
              }}>{t('rec.unmatch')}</button>
              <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="text-sm border rounded-lg px-3 py-1.5" onClick={() => api.excludeReconciliation(sheet.id, { bookId: pickedBook[0], statementId: pickedStmt[0], reason }).then(setSheet).catch((e: any) => setError(e.message))}>{t('rec.exclude')}</button>
              {user?.role === 'ADMIN' && <button type="button" className="text-sm bg-navy text-white rounded-lg px-3 py-1.5" onClick={() => api.approveReconciliation(sheet.id, reason).then((row) => { setSheet(row); loadBoard(); }).catch((e: any) => setError(e.message))}>{t('rec.approve')}</button>}
            </div>
          )}
          <button type="button" className="text-xs underline mt-2 print:hidden" onClick={() => window.print()}>{t('print')}</button>
        </Card>
      )}

      {(tab === 'customers' || tab === 'suppliers') && parties && (
        <Card>
          <p className="text-sm mb-2">{t('rec.gl')} <b>{parties.accountCode}</b>: {money(parties.gl)} · {t('rec.subledger')}: {money(parties.subledger)} · {t('rec.unassigned')}: {money(parties.unassigned)}</p>
          <table className="w-full text-sm mb-3">
            <tbody>
              {(parties.parties || []).map((p: any) => (
                <tr key={p.name} className="border-t border-[#E7E5DE]">
                  <td className="py-1">{p.name}</td>
                  <td>{money(p.net)}</td>
                  <td>{t('rec.openInv')} {(p.openInvoices || []).reduce((s: number, i: any) => s + i.remaining, 0).toFixed(2)}</td>
                  <td>{t('rec.unapplied')} {(p.settlements || []).reduce((s: number, i: any) => s + i.unapplied, 0).toFixed(2)}</td>
                  <td>
                    {(p.settlements || []).filter((s: any) => s.unapplied > 0).map((s: any) => (
                      <span key={s.id}>
                        {(p.openInvoices || []).filter((i: any) => i.remaining > 0).map((i: any) => (
                          <button key={i.id} type="button" className="text-xs underline mx-1" onClick={() => api.applyParty({ partyType: tab === 'customers' ? 'CUSTOMER' : 'SUPPLIER', sourceId: s.id, targetId: i.id, amount: Math.min(s.unapplied, i.remaining) }).then(setParties).catch((e: any) => setError(e.message))}>{t('rec.apply')}</button>
                        ))}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="grid md:grid-cols-3 gap-2 print:hidden" onSubmit={(e) => {
            e.preventDefault();
            api.startPartyStatement({ type: tab === 'customers' ? 'CUSTOMER' : 'SUPPLIER', ...partyForm, externalClosing: Number(partyForm.externalClosing || 0) }).then(setSheet).catch((err: any) => setError(err.message));
          }}>
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.party')} value={partyForm.party} onChange={(e) => setPartyForm({ ...partyForm, party: e.target.value })} />
            <input className="border border-[#E7E5DE] rounded-lg p-2 text-sm" placeholder={t('rec.closing')} value={partyForm.externalClosing} onChange={(e) => setPartyForm({ ...partyForm, externalClosing: e.target.value })} />
            <textarea className="md:col-span-3 border border-[#E7E5DE] rounded-lg p-2 text-sm" rows={3} placeholder={t('rec.csv')} value={partyForm.csv} onChange={(e) => setPartyForm({ ...partyForm, csv: e.target.value })} />
            <button className="bg-gold text-navy font-bold rounded-lg text-sm">{t('rec.openRec')}</button>
          </form>
        </Card>
      )}

      {tab === 'inventory' && stockTie && (
        <Card>
          <p className="text-sm">{t('rec.subledger')}: <b>{money(stockTie.valuation)}</b></p>
          <p className="text-sm">{t('rec.gl')} 1105: <b>{money(stockTie.gl)}</b></p>
          <p className={`text-sm ${Math.abs(stockTie.difference) < 0.02 ? 'text-emerald-700' : 'text-red-700'}`}>{t('rec.diff')}: <b>{money(stockTie.difference)}</b></p>
          {stockTie.suggestion && <p className="text-sm mt-2">{t('debit')} {stockTie.suggestion.debitAccount} {money(stockTie.suggestion.amount)} / {t('credit')} {stockTie.suggestion.creditAccount} {money(stockTie.suggestion.amount)} — {stockTie.suggestion.reason}</p>}
          <p className="text-xs text-[#6C6A82] mt-2">{t('rec.preview')}</p>
        </Card>
      )}

      {tab === 'vat' && vatTie && (
        <Card>
          <p className="text-sm">2102: {money(vatTie.outputGl)} · {t('nav.sales')}: {money(vatTie.salesVat)} · {t('rec.diff')}: {money(vatTie.outputDiff)}</p>
          <p className="text-sm">1106: {money(vatTie.inputGl)} · {t('nav.purchases')}: {money(vatTie.purchaseVat)} · {t('rec.diff')}: {money(vatTie.inputDiff)}</p>
          <p className="text-sm mt-2">{t('rec.netVat')}: {money(vatTie.net)}</p>
          <p className="text-xs text-[#6C6A82] mt-2">{vatTie.notice}</p>
        </Card>
      )}

      {tab === 'statement' && (
        <Card>
          <div className="flex gap-2 mb-3 print:hidden">
            <select className="border border-[#E7E5DE] rounded-lg p-2 text-sm" value={ledgerCode} onChange={(e) => setLedgerCode(e.target.value)}>
              <option value="">{t('rec.pickAccount')}</option>
              {accounts.map((a) => <option key={a.id} value={a.code}>{a.code} — {a.nameAr}</option>)}
            </select>
            <button type="button" className="bg-navy text-white rounded-lg px-3 text-sm" onClick={() => api.getAccountStatement(ledgerCode).then(setLedger).catch((e: any) => setError(e.message))}>{t('rec.statement')}</button>
            <button type="button" className="border rounded-lg px-3 text-sm" onClick={() => window.print()}>{t('print')}</button>
          </div>
          {ledger && (
            <>
              <PrintHeader title={`${ledger.account.code} ${ledger.account.nameAr}`} />
              <p className="text-sm mb-2">{t('rec.bookBal')}: <b>{money(ledger.closingBalance)}</b></p>
              <table className="w-full text-sm">
                <tbody>
                  {(ledger.movements || []).map((m: any, i: number) => (
                    <tr key={i} className="border-t border-[#E7E5DE]">
                      <td className="py-1">{gdate(m.date)}</td><td>{m.descAr}</td><td>{money(m.debit)}</td><td>{money(m.credit)}</td><td>{money(m.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
