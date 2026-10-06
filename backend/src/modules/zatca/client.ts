import { zatcaBaseUrl, basicAuth } from './env';

export interface ZatcaHttpResult {
  ok: boolean;
  status: number;
  data: any;
  raw: string;
}

async function call(opts: {
  env: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: unknown;
  otp?: string;
  user?: string;
  secret?: string;
  extraHeaders?: Record<string, string>;
}): Promise<ZatcaHttpResult> {
  const headers: Record<string, string> = {
    'Accept-Version': 'V2',
    'Accept-Language': 'ar',
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(opts.extraHeaders || {}),
  };
  if (opts.otp) headers.OTP = String(opts.otp);
  if (opts.user && opts.secret) headers.Authorization = basicAuth(opts.user, opts.secret);

  const res = await fetch(`${zatcaBaseUrl(opts.env)}${opts.path}`, {
    method: opts.method,
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const raw = await res.text();
  let data: any = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = { raw }; }
  return { ok: res.ok, status: res.status, data, raw };
}

export const zatcaApi = {
  complianceCsid: (env: string, csrBase64: string, otp: string) =>
    call({ env, method: 'POST', path: '/compliance', otp, body: { csr: csrBase64 } }),

  complianceInvoice: (env: string, user: string, secret: string, payload: { invoiceHash: string; uuid: string; invoice: string }) =>
    call({ env, method: 'POST', path: '/compliance/invoices', user, secret, body: payload }),

  productionCsid: (env: string, user: string, secret: string, complianceRequestId: string) =>
    call({ env, method: 'POST', path: '/production/csids', user, secret, body: { compliance_request_id: complianceRequestId } }),

  renewCsid: (env: string, user: string, secret: string, csrBase64: string, otp: string) =>
    call({ env, method: 'PATCH', path: '/production/csids', user, secret, otp, body: { csr: csrBase64 } }),

  report: (env: string, user: string, secret: string, payload: { invoiceHash: string; uuid: string; invoice: string }) =>
    call({
      env, method: 'POST', path: '/invoices/reporting/single', user, secret, body: payload,
      extraHeaders: { 'Clearance-Status': '0' },
    }),

  clear: (env: string, user: string, secret: string, payload: { invoiceHash: string; uuid: string; invoice: string }) =>
    call({
      env, method: 'POST', path: '/invoices/clearance/single', user, secret, body: payload,
      extraHeaders: { 'Clearance-Status': '1' },
    }),
};
