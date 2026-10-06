const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path: string, options: RequestInit = {}, tokenKey: 'jadara_token' | 'jadara_owner_token' = 'jadara_token') {
  const token = localStorage.getItem(tokenKey);
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 45000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('انتهت مهلة الانتظار — تحقق من الاتصال ثم أعد المحاولة');
    throw new Error('تعذّر الاتصال بالخادم');
  } finally {
    window.clearTimeout(timer);
  }
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('الخادم أعاد رداً غير متوقع. حدّث الصفحة ثم أعد المحاولة.');
  }
  if (!res.ok) {
    const err: any = new Error(data.error || 'حدث خطأ غير متوقع');
    if (data.needUnified) err.needUnified = true;
    if (res.status === 402 && tokenKey === 'jadara_token') {
      sessionStorage.setItem('jadara_login_notice', data.error || 'تم إيقاف الاشتراك');
      ['jadara_token', 'jadara_user', 'jadara_customer'].forEach((k) => localStorage.removeItem(k));
      if (!window.location.pathname.startsWith('/login')) window.location.href = '/login';
    }
    throw err;
  }
  return data;
}

// ---- Tenant (accounting app) API ----
export const api = {
  login: (email: string, password: string, unifiedNumber?: string) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, unifiedNumber: unifiedNumber || undefined }) }),
  getCompany: () => request('/auth/company'),
  setCompanyLogo: (image: string) => request('/auth/company/logo', { method: 'POST', body: JSON.stringify({ image }) }),
  clearCompanyLogo: () => request('/auth/company/logo', { method: 'DELETE' }),
  getAccounts: () => request('/accounts'),
  addAccount: (body: any) => request('/accounts', { method: 'POST', body: JSON.stringify(body) }),
  getJournal: () => request('/journal'),
  addJournalEntry: (body: any) => request('/journal', { method: 'POST', body: JSON.stringify(body) }),
  getTrialBalance: () => request('/journal/trial-balance'),
  getVatReturn: (year: number, quarter: number) => request(`/vat/return?year=${year}&quarter=${quarter}`),
  getZakat: () => request('/zakat'),
  // Branches
  getBranches: () => request('/branches'),
  addBranch: (body: any) => request('/branches', { method: 'POST', body: JSON.stringify(body) }),
  // Inventory setup
  getCategories: () => request('/inventory/categories'),
  addCategory: (body: any) => request('/inventory/categories', { method: 'POST', body: JSON.stringify(body) }),
  getUnits: () => request('/inventory/units'),
  addUnit: (body: any) => request('/inventory/units', { method: 'POST', body: JSON.stringify(body) }),
  getWarehouses: () => request('/inventory/warehouses'),
  addWarehouse: (body: any) => request('/inventory/warehouses', { method: 'POST', body: JSON.stringify(body) }),
  getProducts: () => request('/inventory/products'),
  addProduct: (body: any) => request('/inventory/products', { method: 'POST', body: JSON.stringify(body) }),
  updateProduct: (id: string, body: any) => request(`/inventory/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  // Stock
  getStockBalances: (warehouseId?: string) => request(`/stock/balances${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
  addStockMovement: (body: any) => request('/stock/movements', { method: 'POST', body: JSON.stringify(body) }),
  listStockCounts: () => request('/stock/counts'),
  openStockCount: (body: { mode: 'warehouse' | 'branch'; warehouseIds?: string[]; branchIds?: string[]; all?: boolean; countedOn: string }) => request('/stock/counts', { method: 'POST', body: JSON.stringify(body) }),
  getStockCount: (id: string) => request(`/stock/counts/${id}`),
  setCountedQty: (countId: string, lineId: string, countedQty: number) =>
    request(`/stock/counts/${countId}/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify({ countedQty }) }),
  submitStockCount: (countId: string) => request(`/stock/counts/${countId}/submit`, { method: 'POST' }),
  // Finance
  getTreasuries: () => request('/finance/treasuries'),
  addTreasury: (body: any) => request('/finance/treasuries', { method: 'POST', body: JSON.stringify(body) }),
  getTreasuryBalance: (id: string) => request(`/finance/treasuries/${id}/balance`),
  getVouchers: () => request('/finance/vouchers'),
  addVoucher: (body: any) => request('/finance/vouchers', { method: 'POST', body: JSON.stringify(body) }),
  getCostCenters: () => request('/cost-centers'),
  addCostCenter: (body: any) => request('/cost-centers', { method: 'POST', body: JSON.stringify(body) }),
  stopCostCenter: (id: string) => request(`/cost-centers/${id}/stop`, { method: 'POST' }),
  costCenterIncome: (from?: string, to?: string) => request(`/cost-centers/reports/income?from=${from || ''}&to=${to || ''}`),
  costCenterTrial: (costCenterId?: string, from?: string, to?: string) => request(`/cost-centers/reports/trial?costCenterId=${costCenterId || ''}&from=${from || ''}&to=${to || ''}`),
  costCenterLedger: (costCenterId: string, from?: string, to?: string) => request(`/cost-centers/reports/ledger?costCenterId=${costCenterId}&from=${from || ''}&to=${to || ''}`),
  getAllocationRules: () => request('/cost-centers/rules'),
  addAllocationRule: (body: any) => request('/cost-centers/rules', { method: 'POST', body: JSON.stringify(body) }),
  reconcileSummary: () => request('/reconcile/summary'),
  startBankRec: (body: any) => request('/reconcile/bank', { method: 'POST', body: JSON.stringify(body) }),
  startCashRec: (body: any) => request('/reconcile/cash', { method: 'POST', body: JSON.stringify(body) }),
  getReconciliation: (id: string) => request(`/reconcile/${id}`),
  matchReconciliation: (id: string, body: any) => request(`/reconcile/${id}/match`, { method: 'POST', body: JSON.stringify(body) }),
  unmatchReconciliation: (id: string, groupId: string) => request(`/reconcile/${id}/unmatch`, { method: 'POST', body: JSON.stringify({ groupId }) }),
  excludeReconciliation: (id: string, body: any) => request(`/reconcile/${id}/exclude`, { method: 'POST', body: JSON.stringify(body) }),
  approveReconciliation: (id: string, exceptionReason?: string) => request(`/reconcile/${id}/approve`, { method: 'POST', body: JSON.stringify({ exceptionReason }) }),
  getPartyControl: (type: 'CUSTOMER' | 'SUPPLIER') => request(`/reconcile/parties?type=${type}`),
  applyParty: (body: any) => request('/reconcile/parties/apply', { method: 'POST', body: JSON.stringify(body) }),
  startPartyStatement: (body: any) => request('/reconcile/party-statement', { method: 'POST', body: JSON.stringify(body) }),
  reconcileInventory: () => request('/reconcile/inventory'),
  reconcileVat: () => request('/reconcile/vat'),
  // Reports
  getSalesReport: (from?: string, to?: string) => request(`/reports/sales${from || to ? `?from=${from || ''}&to=${to || ''}` : ''}`),
  getPurchasesReport: (from?: string, to?: string) => request(`/reports/purchases${from || to ? `?from=${from || ''}&to=${to || ''}` : ''}`),
  getInventoryReport: () => request('/reports/inventory'),
  getLedgerDetail: (code: string) => request(`/reports/ledger/${code}`),
  // كشف حساب وتقارير إضافية
  getAccountStatement: (code: string, from?: string, to?: string) => request(`/reports/account-statement/${code}?from=${from || ''}&to=${to || ''}`),
  getExpensesReport: (from?: string, to?: string) => request(`/reports/expenses?from=${from || ''}&to=${to || ''}`),
  getSummaryReport: (from?: string, to?: string) => request(`/reports/summary?from=${from || ''}&to=${to || ''}`),
  getDashboard: (from?: string, to?: string) => request(`/reports/dashboard?from=${from || ''}&to=${to || ''}`),
  // دليل الحسابات
  getAccountRoots: () => request('/accounts/roots'),
  getAccountsWithBalances: () => request('/accounts?withBalances=1'),
  updateAccount: (id: string, body: any) => request(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: (id: string) => request(`/accounts/${id}`, { method: 'DELETE' }),
  // القيود
  getEntry: (id: string) => request(`/journal/${id}`),
  deleteEntry: (id: string) => request(`/journal/${id}`, { method: 'DELETE' }),
  getTrialBalanceReport: (q: { from?: string; to?: string; level?: string; zero?: string } = {}) =>
    request(`/journal/reports/trial-balance?from=${q.from || ''}&to=${q.to || ''}&level=${q.level || 'detail'}&zero=${q.zero || '0'}`),
  // القوائم المالية
  getIncomeStatement: (from?: string, to?: string) => request(`/statements/income?from=${from || ''}&to=${to || ''}`),
  getBalanceSheet: (asOf?: string) => request(`/statements/balance-sheet?asOf=${asOf || ''}`),
  getEquityStatement: (from?: string, to?: string) => request(`/statements/equity?from=${from || ''}&to=${to || ''}`),
  getCashFlow: (from?: string, to?: string) => request(`/statements/cash-flow?from=${from || ''}&to=${to || ''}`),
  getHealth: () => request('/statements/health'),
  // الفترات المالية
  getFiscalYears: () => request('/periods/years'),
  addFiscalYear: (body: any) => request('/periods/years', { method: 'POST', body: JSON.stringify(body) }),
  getOpening: (yearId: string) => request(`/periods/opening/${yearId}`),
  saveOpening: (yearId: string, lines: any[]) => request(`/periods/opening/${yearId}`, { method: 'POST', body: JSON.stringify({ lines }) }),
  getClosingPreview: (yearId: string) => request(`/periods/closing-preview/${yearId}`),
  closeYear: (yearId: string, body: any) => request(`/periods/close/${yearId}`, { method: 'POST', body: JSON.stringify(body) }),
  reopenYear: (yearId: string) => request(`/periods/reopen/${yearId}`, { method: 'POST' }),
  // Sales (quotations, orders, invoices, returns)
  getSalesDocs: (type?: string) => request(`/sales${type ? `?type=${type}` : ''}`),
  addSalesDoc: (body: any) => request('/sales', { method: 'POST', body: JSON.stringify(body) }),
  confirmSalesDoc: (id: string) => request(`/sales/${id}/confirm`, { method: 'POST' }),
  posSale: (body: any) => request('/sales/pos', { method: 'POST', body: JSON.stringify(body) }),
  previewDiscount: (code: string) => request('/sale-discounts/preview', { method: 'POST', body: JSON.stringify({ code }) }),
  getDiscountCodes: () => request('/sale-discounts'),
  addDiscountCode: (body: any) => request('/sale-discounts', { method: 'POST', body: JSON.stringify(body) }),
  updateDiscountCode: (id: string, body: any) => request(`/sale-discounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteDiscountCode: (id: string) => request(`/sale-discounts/${id}`, { method: 'DELETE' }),
  // Purchases (requests, orders, invoices, returns)
  getPurchaseDocs: (type?: string) => request(`/purchases${type ? `?type=${type}` : ''}`),
  addPurchaseDoc: (body: any) => request('/purchases', { method: 'POST', body: JSON.stringify(body) }),
  updatePurchaseDoc: (id: string, body: any) => request(`/purchases/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  confirmPurchaseDoc: (id: string) => request(`/purchases/${id}/confirm`, { method: 'POST' }),
  purchaseInvoiceFrom: (id: string, warehouseId?: string) => request(`/purchases/${id}/invoice`, { method: 'POST', body: JSON.stringify({ warehouseId }) }),
  zatcaStatus: () => request('/zatca/status'),
  zatcaUnsent: (year: number, quarter: number) => request(`/zatca/unsent?year=${year}&quarter=${quarter}`),
  zatcaSetup: (body: any) => request('/zatca/setup', { method: 'POST', body: JSON.stringify(body) }),
  zatcaConnect: (body: any) => request('/zatca/connect', { method: 'POST', body: JSON.stringify(body) }),
  zatcaCcsid: (otp: string) => request('/zatca/compliance-csid', { method: 'POST', body: JSON.stringify({ otp }) }),
  zatcaComplianceInvoices: () => request('/zatca/compliance-invoices', { method: 'POST' }),
  zatcaPcsid: () => request('/zatca/production-csid', { method: 'POST' }),
  zatcaRenew: (body: any) => request('/zatca/renew', { method: 'POST', body: JSON.stringify(body) }),
  zatcaPing: () => request('/zatca/ping', { method: 'POST' }),
  zatcaRetry: (invoiceId: string) => request(`/zatca/retry/${invoiceId}`, { method: 'POST' }),
  zatcaTestSend: () => request('/zatca/test-send', { method: 'POST' }),
  supportCategories: () => request('/support/categories'),
  supportTickets: () => request('/support'),
  supportTicket: (id: string) => request(`/support/${id}`),
  createSupportTicket: (body: any) => request('/support', { method: 'POST', body: JSON.stringify(body) }),
  replySupportTicket: (id: string, body: any) => request(`/support/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }),
  getUsers: () => request('/users'),
  addUser: (body: any) => request('/users', { method: 'POST', body: JSON.stringify(body) }),
  updateUser: (id: string, body: any) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteUser: (id: string) => request(`/users/${id}`, { method: 'DELETE' }),
};

// ---- Owner portal API ----
export const ownerApi = {
  login: (email: string, password: string) =>
    request('/owner/login', { method: 'POST', body: JSON.stringify({ email, password }) }, 'jadara_owner_token'),
  getLeads: () => request('/owner/leads', {}, 'jadara_owner_token'),
  activateLead: (id: string, body: any) =>
    request(`/owner/leads/${id}/activate`, { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
  terminateLead: (id: string) =>
    request(`/owner/leads/${id}/terminate`, { method: 'POST' }, 'jadara_owner_token'),
  terminateTenant: (id: string) =>
    request(`/owner/tenants/${id}/terminate`, { method: 'POST' }, 'jadara_owner_token'),
  createQuote: (id: string, body: any) =>
    request(`/owner/leads/${id}/quote`, { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
  createInvoice: (id: string, body: any = {}) =>
    request(`/owner/leads/${id}/invoice`, { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
  createTenantInvoice: (id: string) =>
    request(`/owner/tenants/${id}/invoice`, { method: 'POST', body: JSON.stringify({}) }, 'jadara_owner_token'),
  suspendTenant: (id: string) =>
    request(`/owner/tenants/${id}/suspend`, { method: 'POST' }, 'jadara_owner_token'),
  resumeTenant: (id: string) =>
    request(`/owner/tenants/${id}/resume`, { method: 'POST' }, 'jadara_owner_token'),
  forgotPassword: (email: string) => request('/owner/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (email: string, token: string, password: string) =>
    request('/owner/reset-password', { method: 'POST', body: JSON.stringify({ email, token, password }) }),
  getOverview: () => request('/owner/overview', {}, 'jadara_owner_token'),
  getCodes: () => request('/owner/codes', {}, 'jadara_owner_token'),
  createCode: (body: any) => request('/owner/codes', { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
  updateCode: (id: string, body: any) => request(`/owner/codes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, 'jadara_owner_token'),
  deleteCode: (id: string) => request(`/owner/codes/${id}`, { method: 'DELETE' }, 'jadara_owner_token'),
  renewTenant: (id: string, body: any) => request(`/owner/tenants/${id}/renew`, { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
  getTenants: () => request('/owner/tenants', {}, 'jadara_owner_token'),
  updateSubscription: (tenantId: string, body: any) =>
    request(`/owner/tenants/${tenantId}/subscription`, { method: 'PATCH', body: JSON.stringify(body) }, 'jadara_owner_token'),
  replaceAdminEmail: (tenantId: string, userId: string, email: string) =>
    request(`/owner/tenants/${tenantId}/users/${userId}/email`, { method: 'PATCH', body: JSON.stringify({ email }) }, 'jadara_owner_token'),
  getRevenue: () => request('/owner/revenue', {}, 'jadara_owner_token'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request('/owner/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }, 'jadara_owner_token'),
  supportMeta: () => request('/owner/support/categories', {}, 'jadara_owner_token'),
  supportTickets: () => request('/owner/support', {}, 'jadara_owner_token'),
  supportTicket: (id: string) => request(`/owner/support/${id}`, {}, 'jadara_owner_token'),
  replySupport: (id: string, body: any) =>
    request(`/owner/support/${id}/messages`, { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
  resolveSupport: (id: string, body: any) =>
    request(`/owner/support/${id}/resolve`, { method: 'POST', body: JSON.stringify(body) }, 'jadara_owner_token'),
};

// ---- Public / customer (before activation) ----
export const authApi = {
  forgotPassword: (email: string, unifiedNumber?: string) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email, unifiedNumber: unifiedNumber || undefined }) }),
  resetPassword: (email: string, token: string, password: string) =>
    request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, token, password }) }),
};

export const customerApi = {
  register: (body: any) => request('/customer/register', { method: 'POST', body: JSON.stringify(body) }),
  me: () => request('/customer/me'),
  validateCode: (code: string, plan: string) => request('/customer/validate-code', { method: 'POST', body: JSON.stringify({ code, plan }) }),
};

// تنزيل ملف PDF محمي بالتوكن. النافذة تُفتح فوراً مع نقرة المستخدم حتى لا يحجبها المتصفح.
export async function openPdf(path: string, tokenKey: 'jadara_token' | 'jadara_owner_token' = 'jadara_token') {
  const popup = window.open('', '_blank');
  try {
    const token = localStorage.getItem(tokenKey);
    const lang = localStorage.getItem('jadara_lang') || 'ar';
    const reqUrl = `${API_URL}${path}${path.includes('?') ? '&' : '?'}lang=${lang}`;
    const res = await fetch(reqUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error('تعذّر فتح المستند');
    const blobUrl = URL.createObjectURL(await res.blob());
    if (!popup) {
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.click();
      return;
    }
    popup.location.href = blobUrl;
    popup.onload = () => setTimeout(() => popup.print(), 400);
  } catch (e) {
    if (popup && !popup.closed) popup.close();
    alert(e instanceof Error ? e.message : 'تعذّر فتح المستند');
  }
}

export async function downloadSupportFile(path: string, filename: string, tokenKey: 'jadara_token' | 'jadara_owner_token' = 'jadara_token') {
  const token = localStorage.getItem(tokenKey);
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('تعذّر تنزيل المرفق');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export async function openOwnerFile(path: string) {
  const token = localStorage.getItem('jadara_owner_token');
  const res = await fetch(`${API_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('تعذّر فتح المرفق');
  const blobUrl = URL.createObjectURL(await res.blob());
  window.open(blobUrl, '_blank');
}

export async function downloadCompanyArchive() {
  const token = localStorage.getItem('jadara_token');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), 10 * 60 * 1000);
  try {
    const res = await fetch(`${API_URL}/export/company`, {
      signal: ctrl.signal,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.error || 'تعذّر تصدير بيانات المنشأة');
    }
    const blob = await res.blob();
    const dispo = res.headers.get('Content-Disposition') || '';
    const named = /filename\*=UTF-8''([^;]+)/.exec(dispo);
    const filename = named ? decodeURIComponent(named[1]) : 'jadara-company.zip';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('انتهت مهلة التجهيز. أعد المحاولة.');
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function downloadPdf(path: string, filename: string, tokenKey: 'jadara_token' | 'jadara_owner_token' = 'jadara_token') {
  const token = localStorage.getItem(tokenKey);
  const lang = localStorage.getItem('jadara_lang') || 'ar';
  const res = await fetch(`${API_URL}${path}${path.includes('?') ? '&' : '?'}lang=${lang}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('تعذّر تنزيل الملف');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
