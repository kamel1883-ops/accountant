import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { fatooraNetPath, runFatooraNet } from './sdk';

const execFileAsync = promisify(execFile);

function opensslBin() {
  const candidates = [
    process.env.OPENSSL_PATH,
    'C:\\Users\\kamel\\.local\\MinGit\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe',
    'openssl',
  ].filter(Boolean) as string[];
  for (const c of candidates) {
    if (c === 'openssl') return c;
    if (fs.existsSync(c)) return c;
  }
  return 'openssl';
}

export interface CsrInput {
  vatNumber: string;
  orgName: string;
  orgUnit: string;
  commonName: string;
  serialNumber: string;
  registeredAddress: string;
  businessCategory: string;
  invoiceType: string;
  environment?: string;
  production?: boolean;
}

function sdkCommonName(env: string, vat: string, cn: string) {
  if (!/Code-Signing/i.test(cn)) return cn;
  if (env === 'production') return `PRD-JADARA-${vat}`;
  if (env === 'simulation') return `PRE-JADARA-${vat}`;
  return `TST-JADARA-${vat}`;
}

async function generateCsrWithSdk(input: CsrInput, env: string) {
  const exe = fatooraNetPath();
  if (!fs.existsSync(exe)) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jadara-zatca-sdkcsr-'));
  const cfgPath = path.join(dir, 'csr.properties');
  const keyPath = path.join(dir, 'private.pem');
  const csrPath = path.join(dir, 'csr.pem');
  const cn = sdkCommonName(env, input.vatNumber, input.commonName || '');
  fs.writeFileSync(cfgPath, [
    `csr.common.name=${cn}`,
    `csr.serial.number=${input.serialNumber}`,
    `csr.organization.identifier=${input.vatNumber}`,
    `csr.organization.unit.name=${input.orgUnit}`,
    `csr.organization.name=${input.orgName}`,
    'csr.country.name=SA',
    `csr.invoice.type=${input.invoiceType || '1100'}`,
    `csr.location.address=${input.registeredAddress}`,
    `csr.industry.business.category=${input.businessCategory}`,
    '',
  ].join('\n'), 'utf8');
  const args = [
    'csr',
    '-csrConfig', cfgPath,
    '-pem', 'true',
    '-generatedCsr', csrPath,
    '-privateKey', keyPath,
  ];
  if (env === 'sandbox') args.push('-nonprod', 'true');
  if (env === 'simulation') args.push('-sim', 'true');
  try {
    await runFatooraNet(args, 60000);
    const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
    const csrPem = fs.readFileSync(csrPath, 'utf8');
    return { privateKeyPem, csrPem, csrBase64: Buffer.from(csrPem, 'utf8').toString('base64') };
  } catch {
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function generateCsr(input: CsrInput) {
  const env = input.environment || (input.production ? 'production' : 'sandbox');
  const fromSdk = await generateCsrWithSdk(input, env);
  if (fromSdk) return fromSdk;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jadara-zatca-'));
  const keyPath = path.join(dir, 'private.pem');
  const csrPath = path.join(dir, 'csr.pem');
  const cnfPath = path.join(dir, 'config.cnf');
  const templateName =
    env === 'production' ? 'ZATCA-Code-Signing' :
    env === 'simulation' ? 'PREZATCA-Code-Signing' :
    'TSTZATCA-Code-Signing';
  const cn = input.commonName || templateName;

  const cnf = `oid_section = OIDs
[OIDs]
certificateTemplateName = 1.3.6.1.4.1.311.20.2

[req]
default_bits = 2048
emailAddress = info@jadara-finance.com
req_extensions = v3
x509_extensions = v3
prompt = no
default_md = sha256
req_extensions = req_ext
distinguished_name = dn

[dn]
C=SA
OU=${input.orgUnit}
O=${input.orgName}
CN=${cn}

[v3]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment
certificateTemplateName = ASN1:PRINTABLESTRING:${templateName}
subjectAltName = dirName:alt_names

[req_ext]
certificateTemplateName = ASN1:PRINTABLESTRING:${templateName}
subjectAltName = dirName:alt_names

[alt_names]
SN=${input.serialNumber}
UID=${input.vatNumber}
title=${input.invoiceType}
registeredAddress=${input.registeredAddress}
businessCategory=${input.businessCategory}
`;
  fs.writeFileSync(cnfPath, cnf, 'utf8');

  const bin = opensslBin();
  try {
    await execFileAsync(bin, ['ecparam', '-name', 'secp256k1', '-genkey', '-noout', '-out', keyPath]);
    await execFileAsync(bin, ['req', '-new', '-sha256', '-key', keyPath, '-extensions', 'v3', '-config', cnfPath, '-out', csrPath]);
  } catch (e: any) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(
      'تعذّر توليد CSR. ثبّت حزمة ZATCA SDK (.NET) أو OpenSSL ثم أعد المحاولة. ' +
      String(e?.stderr || e?.message || e),
    );
  }

  const privateKeyPem = fs.readFileSync(keyPath, 'utf8');
  const csrPem = fs.readFileSync(csrPath, 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  const csrBase64 = Buffer.from(csrPem, 'utf8').toString('base64');
  return { privateKeyPem, csrPem, csrBase64 };
}

export function publicKeyFromPrivate(privateKeyPem: string) {
  const key = crypto.createPublicKey(privateKeyPem);
  return key.export({ type: 'spki', format: 'der' }) as Buffer;
}
