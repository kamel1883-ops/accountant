import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

export function zatcaSdkHome() {
  return process.env.ZATCA_SDK_HOME
    || path.join(os.tmpdir(), 'zatca-sdk-r348', 'extracted', 'zatca-einvoicing-sdk-DotNet-238-R3.4.8');
}

export function fatooraNetPath() {
  const home = zatcaSdkHome();
  const win = path.join(home, 'Lib', 'Dot-Net8', 'Test', 'fatooraNet.exe');
  const dll = path.join(home, 'Lib', 'Dot-Net8', 'Test', 'fatooraNet.dll');
  const linuxBin = path.join(home, 'Apps', 'fatooraNet');
  if (process.platform === 'win32' && fs.existsSync(win)) return win;
  if (fs.existsSync(dll)) return dll;
  if (fs.existsSync(linuxBin)) return linuxBin;
  if (fs.existsSync(win)) return win;
  return win;
}

/** Run official fatooraNet: Windows exe, Linux `dotnet fatooraNet.dll` with cwd = Test. */
export async function runFatooraNet(args: string[], timeout = 120000) {
  const tool = fatooraNetPath();
  if (!fs.existsSync(tool)) {
    throw new Error(`ZATCA SDK missing at ${tool}. Set ZATCA_SDK_HOME to the extracted SDK folder.`);
  }
  const cwd = path.dirname(tool.endsWith('.dll') || tool.endsWith('.exe') ? tool : path.join(zatcaSdkHome(), 'Lib', 'Dot-Net8', 'Test'));
  const useDotnet = tool.endsWith('.dll');
  const cmd = useDotnet ? 'dotnet' : tool;
  const fullArgs = useDotnet ? [tool, ...args] : args;
  try {
    return await execFileAsync(cmd, fullArgs, { cwd, timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (e: any) {
    const extra = `${e?.stdout || ''}\n${e?.stderr || ''}`;
    e.message = `${e.message}\n${extra}`;
    throw e;
  }
}

export function certBodyFromToken(token: string) {
  const compact = String(token || '').replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s/g, '');
  const once = Buffer.from(compact, 'base64');
  if (once[0] === 0x30) return compact;
  const asText = once.toString('utf8').replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s/g, '');
  if (asText.startsWith('MI')) return asText;
  return compact;
}

export function certPemFromToken(token: string) {
  const body = certBodyFromToken(token);
  const lines = body.match(/.{1,64}/g) || [body];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function sdkCertFiles() {
  const home = zatcaSdkHome();
  return {
    cert: path.join(home, 'Data', 'Certificates', 'cert.pem'),
    key: path.join(home, 'Data', 'Certificates', 'ec-secp256k1-priv-key.pem'),
  };
}

/** .NET SDK hardcodes Windows backslash paths; copy targets Linux can open. */
function mirrorWindowsSdkPaths() {
  if (process.platform === 'win32') return;
  const home = zatcaSdkHome();
  const copies: [string, string][] = [
    [path.join(home, 'Data', 'Certificates'), path.join(home, 'Data\\Certificates')],
    [path.join(home, 'Data', 'Rules', 'Schematrons'), path.join(home, 'Data\\Rules\\schematrons')],
    [path.join(home, 'Data', 'Rules', 'Schematrons'), path.join(home, 'Data\\Rules\\Schematrons')],
    [path.join(home, 'Data', 'Rules', 'schematrons'), path.join(home, 'Data\\Rules\\schematrons')],
  ];
  for (const [src, dest] of copies) {
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) continue;
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      const from = path.join(src, name);
      if (!fs.statSync(from).isFile()) continue;
      fs.copyFileSync(from, path.join(dest, name));
    }
  }
}

async function withSdkIdentity<T>(certText: string, keyText: string, fn: () => Promise<T>): Promise<T> {
  const files = sdkCertFiles();
  const bakCert = files.cert + '.jadara.bak';
  const bakKey = files.key + '.jadara.bak';
  if (fs.existsSync(files.cert) && !fs.existsSync(bakCert)) fs.copyFileSync(files.cert, bakCert);
  if (fs.existsSync(files.key) && !fs.existsSync(bakKey)) fs.copyFileSync(files.key, bakKey);
  fs.mkdirSync(path.dirname(files.cert), { recursive: true });
  fs.writeFileSync(files.cert, certText.replace(/-----BEGIN CERTIFICATE-----/g, '').replace(/-----END CERTIFICATE-----/g, '').replace(/\s/g, '') + '\n', 'utf8');
  fs.writeFileSync(files.key, keyText.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s/g, '') + '\n', 'utf8');
  const winCertDir = path.join(zatcaSdkHome(), 'Data\\Certificates');
  fs.mkdirSync(winCertDir, { recursive: true });
  fs.copyFileSync(files.cert, path.join(winCertDir, 'cert.pem'));
  fs.copyFileSync(files.key, path.join(winCertDir, 'ec-secp256k1-priv-key.pem'));
  const testDir = path.join(zatcaSdkHome(), 'Lib', 'Dot-Net8', 'Test');
  if (fs.existsSync(testDir)) {
    for (const name of ['cert.pem', 'ec-secp256k1-priv-key.pem'] as const) {
      const from = name === 'cert.pem' ? files.cert : files.key;
      const alias = path.join(testDir, `..\\..\\..\\Data\\Certificates\\${name}`);
      fs.copyFileSync(from, alias);
    }
  }
  mirrorWindowsSdkPaths();
  try {
    return await fn();
  } finally {
    try {
      if (fs.existsSync(bakCert)) fs.copyFileSync(bakCert, files.cert);
      if (fs.existsSync(bakKey)) fs.copyFileSync(bakKey, files.key);
    } catch { /* restore best-effort */ }
  }
}

export function unsignedFromSdkSample(kind: 'simplified-invoice' | 'simplified-credit' | 'simplified-debit', opts: {
  uuid: string;
  icv: number;
  pih: string;
  issueDate: string;
  issueTime: string;
}) {
  const home = zatcaSdkHome();
  const file =
    kind === 'simplified-invoice' ? path.join(home, 'Data', 'Samples', 'Simplified', 'Invoice', 'Simplified_Invoice.xml') :
    kind === 'simplified-credit' ? path.join(home, 'Data', 'Samples', 'Simplified', 'Credit', 'Simplified_Credit_Note.xml') :
    path.join(home, 'Data', 'Samples', 'Simplified', 'Debit', 'Simplified_Debit_Note.xml');
  if (!fs.existsSync(file)) throw new Error(`SDK sample missing: ${file}`);
  let xml = fs.readFileSync(file, 'utf8');
  xml = xml.replace(/<ext:UBLExtensions>[\s\S]*?<\/ext:UBLExtensions>\s*/, '');
  xml = xml.replace(/<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/, '');
  xml = xml.replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/, '');
  xml = xml.replace(/<cbc:UUID>[0-9a-fA-F-]{36}<\/cbc:UUID>/, `<cbc:UUID>${opts.uuid}</cbc:UUID>`);
  xml = xml.replace(/<cbc:IssueDate>[^<]+<\/cbc:IssueDate>/, `<cbc:IssueDate>${opts.issueDate}</cbc:IssueDate>`);
  xml = xml.replace(/<cbc:IssueTime>[^<]+<\/cbc:IssueTime>/, `<cbc:IssueTime>${opts.issueTime}</cbc:IssueTime>`);
  xml = xml.replace(/(<cbc:ID>ICV<\/cbc:ID>\s*<cbc:UUID>)[^<]+/, `$1${opts.icv}`);
  xml = xml.replace(/(<cbc:ID>PIH<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>)[^<]+/, `$1${opts.pih}`);
  return xml;
}

export async function fatooraSignAndRequest(opts: {
  unsignedXml: string;
  certificateToken: string;
  privateKeyPem: string;
}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jadara-fatoora-'));
  const invoicePath = path.join(dir, 'unsigned.xml');
  const signedPath = path.join(dir, 'signed.xml');
  const jsonPath = path.join(dir, 'request.json');
  const certPath = path.join(dir, 'cert.pem');
  const keyPath = path.join(dir, 'private.pem');
  fs.writeFileSync(invoicePath, opts.unsignedXml, 'utf8');
  fs.writeFileSync(certPath, certPemFromToken(opts.certificateToken), 'utf8');
  fs.writeFileSync(keyPath, opts.privateKeyPem, 'utf8');

  return withSdkIdentity(certBodyFromToken(opts.certificateToken) + '\n', opts.privateKeyPem, async () => {
    try {
      const signed = await runFatooraNet([
        'sign',
        '-invoice', invoicePath,
        '-signedInvoice', signedPath,
      ]);
      if (!fs.existsSync(signedPath)) {
        throw new Error(`sign did not write ${signedPath}\n${signed.stdout}\n${signed.stderr}`);
      }
      await runFatooraNet([
        'invoiceRequest',
        '-invoice', signedPath,
        '-apiRequest', jsonPath,
      ]);

      const xml = fs.readFileSync(signedPath, 'utf8');
      const payload = JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as {
        invoiceHash: string;
        uuid: string;
        invoice: string;
      };
      const qrMatch = xml.match(/<cbc:ID>QR<\/cbc:ID>[\s\S]*?<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)</);
      return { xml, invoiceHash: payload.invoiceHash, uuid: payload.uuid, qr: qrMatch?.[1] || '', payload };
    } catch (e: any) {
      const msg = String(e?.stderr || e?.stdout || e?.message || e);
      throw new Error(`fatooraNet failed: ${msg.slice(0, 4000)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}
