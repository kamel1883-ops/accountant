export type ZatcaEnvironment = 'sandbox' | 'simulation' | 'production';

const BASE: Record<ZatcaEnvironment, string> = {
  sandbox: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/developer-portal',
  simulation: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation',
  production: 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core',
};

export function zatcaBaseUrl(env: string) {
  return BASE[(env as ZatcaEnvironment) || 'sandbox'] || BASE.sandbox;
}

/** SHA-256("0") as hex, then that hex string as UTF-8 Base64 — ZATCA SDK Data/PIH/pih.txt */
export const FIRST_PIH = 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWI0NjcyOWQ3M2EyN2ZiNTdlOQ==';

export function basicAuth(user: string, pass: string) {
  return 'Basic ' + Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
}
