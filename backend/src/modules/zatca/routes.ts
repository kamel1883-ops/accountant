import { Router } from 'express';
import { randomUUID, X509Certificate } from 'crypto';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';
import { generateCsr } from './csr';
import { zatcaApi } from './client';
import { stampInvoice, newUuid, pad2 } from './sign';
import { FIRST_PIH, zatcaBaseUrl } from './env';
import { submitExistingInvoice } from './submit';
import { unsentReport } from './guard';
import { invoiceTypeForEnv, sendComplianceInvoices, usesStandardClearance, dummyBuyerVat } from './compliance';
import { parseTaxpayer, requireOtp } from './entity';
import { loadZatcaDevice, loadZatcaDeviceById, protectDevice } from './secrets';
import { redactZatcaText } from './redact';

const router = Router();
router.use(requireAuth);
const admin = requireRole('ADMIN');

const RELINK_PHRASE = 'استبدال الشهادة';

function isProdLive(d: any) {
  return d?.status === 'ACTIVE' && d.environment === 'production' && !!d.pcsidToken;
}

function certWindow(token?: string | null, issued?: Date | null) {
  let expires: Date | null = null;
  let estimated = true;
  if (token) {
    try {
      const buf = token.includes('BEGIN CERTIFICATE') ? Buffer.from(token) : Buffer.from(token, 'base64');
      const x = new X509Certificate(buf);
      const cert = x as X509Certificate & { validToDate?: Date };
      const to = cert.validToDate instanceof Date && !Number.isNaN(cert.validToDate.getTime())
        ? cert.validToDate
        : new Date(x.validTo);
      if (!Number.isNaN(to.getTime())) {
        expires = to;
        estimated = false;
      }
    } catch { /* تاريخ الانتهاء يُقدَّر من تاريخ الإصدار إن تعذّر قراءة الشهادة */ }
  }
  if (!expires && issued) {
    expires = new Date(new Date(issued).getTime() + 365 * 24 * 3600 * 1000);
    estimated = true;
  }
  return { expires, estimated };
}

function publicDevice(d: any, admin = false) {
  if (!d) return null;
  const locked = isProdLive(d);
  const phase =
    d.status === 'ACTIVE' && d.pcsidToken ? 'ready' :
    d.lastError && d.status !== 'ACTIVE' ? 'failed' :
    d.status === 'COMPLIANCE' ? 'awaiting_pcsid' :
    d.status === 'CCSID' ? 'compliance' :
    d.status === 'CSR' ? 'otp_required' :
    'not_configured';
  const vat = String(d.vatNumber || '').replace(/\D/g, '');
  const window = certWindow(d.pcsidToken, d.pcsidIssuedAt);
  return {
    id: d.id,
    environment: d.environment,
    vatNumber: locked && !admin ? undefined : d.vatNumber,
    vatLast4: vat.slice(-4),
    orgName: d.orgName,
    orgUnit: d.orgUnit,
    commonName: locked ? undefined : d.commonName,
    serialNumber: locked ? undefined : d.serialNumber,
    registeredAddress: d.registeredAddress,
    street: d.street,
    buildingNumber: d.buildingNumber,
    cityName: d.cityName,
    postalZone: d.postalZone,
    district: d.district,
    businessCategory: d.businessCategory,
    invoiceType: d.invoiceType,
    crNumber: d.crNumber,
    hasCsr: !!d.csrPem,
    hasCcsid: !!d.ccsidToken,
    hasPcsid: !!d.pcsidToken,
    complianceRequestId: locked ? undefined : d.complianceRequestId,
    icv: d.icv,
    status: d.status,
    lastError: redactZatcaText(d.lastError, 800),
    phase,
    apiBase: locked ? undefined : zatcaBaseUrl(d.environment),
    readyToSend: d.status === 'ACTIVE' && !!d.pcsidToken,
    sandboxOnly: d.environment === 'sandbox',
    simulationOnly: d.environment === 'simulation',
    pcsidIssuedAt: d.pcsidIssuedAt,
    certIssuedAt: d.pcsidIssuedAt,
    certExpiresAt: window.expires,
    certExpiryEstimated: window.estimated,
    certificateStatus: d.status === 'ACTIVE' && d.pcsidToken ? 'active' : 'inactive',
    locked,
    updatedAt: d.updatedAt,
  };
}

async function authorizeRelink(req: any, d: any, action: string): Promise<string | null> {
  if (!isProdLive(d)) return null;
  const reason = String(req.body?.reason || '').trim();
  const otp = String(req.body?.otp || '').trim();
  if (otp && reason.includes(otp)) return 'لا تكتب رمز التحقق داخل سبب الإجراء.';
  if (/^\d{4,8}$/.test(reason)) return 'سبب الإجراء يجب أن يكون وصفاً وليس رقماً.';
  if (req.body?.reset !== true || req.body?.confirmReplace !== true || String(req.body?.confirmText || '') !== RELINK_PHRASE || reason.length < 12) {
    return 'الربط بالإنتاج فعّال. إعادة التهيئة أو التجديد تحتاج تأكيدين وسبب الإجراء من مدير المنشأة.';
  }
  const nextVat = String(req.body?.vatNumber || '').replace(/\D/g, '');
  const nextName = String(req.body?.orgName || '').trim();
  const legalChanged = (nextVat && nextVat !== String(d.vatNumber || '').replace(/\D/g, ''))
    || (nextName && nextName !== String(d.orgName || '').trim());
  const envChanged = req.body?.environment && req.body.environment !== d.environment;
  if ((legalChanged || envChanged) && req.body?.allowLegalChange !== true) {
    return 'تغيير الرقم الضريبي أو اسم المنشأة أو البيئة مقفل بعد الإنتاج. أكّد تغيير بيانات المنشأة إن كان مقصوداً.';
  }
  await prisma.zatcaAudit.create({
    data: {
      tenantId: req.auth.tenantId,
      userId: req.auth.userId,
      action,
      reason: reason.slice(0, 400),
    },
  });
  return null;
}

router.get('/status', async (req, res) => {
  const admin = req.auth!.role === 'ADMIN';
  const d = await loadZatcaDevice(req.auth!.tenantId);
  const recent = await prisma.zatcaSubmission.findMany({
    where: { tenantId: req.auth!.tenantId }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, kind: true, status: true, httpStatus: true, createdAt: true, invoiceId: true },
  });
  const audits = admin
    ? await prisma.zatcaAudit.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { id: true, action: true, reason: true, createdAt: true, userId: true },
    })
    : [];
  const actors = audits.length
    ? await prisma.user.findMany({
      where: { id: { in: audits.map((a) => a.userId) } },
      select: { id: true, nameAr: true },
    })
    : [];
  const names = new Map(actors.map((u) => [u.id, u.nameAr]));
  res.json({
    device: publicDevice(d, admin),
    submissions: recent,
    audits: audits.map((a) => ({ id: a.id, action: a.action, reason: a.reason, createdAt: a.createdAt, actor: names.get(a.userId) || 'مدير المنشأة' })),
  });
});

router.post('/ping', async (req, res) => {
  const d = await loadZatcaDevice(req.auth!.tenantId);
  if (!d || d.status !== 'ACTIVE' || !d.pcsidToken) {
    return res.json({ ok: false, ready: false, message: 'الربط غير مكتمل. لم تُرسل فاتورة.' });
  }
  res.json({
    ok: true,
    ready: true,
    environment: d.environment,
    message: 'الشهادة محفوظة والجهاز جاهز. الإرسال يتم من شاشة المبيعات، ولم تُصدر فاتورة من هذا الاختبار.',
  });
});

router.post('/setup', admin, async (req, res) => {
  const existing = await loadZatcaDevice(req.auth!.tenantId);
  const relink = await authorizeRelink(req, existing, 'RECONFIGURE');
  if (relink) return res.status(409).json({ error: relink });
  if (existing?.status === 'ACTIVE' && !req.body?.reset) {
    return res.status(409).json({ error: 'الجهاز مفعّل. أكّد إعادة الربط (reset) فقط إذا أردت شهادة جديدة.' });
  }
  const b = req.body || {};
  const env = ['sandbox', 'simulation', 'production'].includes(b.environment) ? b.environment : 'sandbox';
  const t = parseTaxpayer(b, env);
  if (!t.ok) return res.status(400).json({ error: t.error });

  const cn =
    env === 'sandbox' ? 'TSTZATCA-Code-Signing' :
    env === 'simulation' ? 'PREZATCA-Code-Signing' :
    t.orgName;
  const serial = `1-Jadara|2-EGS|3-${randomUUID()}`;
  const invoiceType = invoiceTypeForEnv(env, b.invoiceType);
  const csr = await generateCsr({
    vatNumber: t.vat,
    orgName: t.orgName,
    orgUnit: t.orgUnit,
    commonName: cn,
    serialNumber: serial,
    registeredAddress: t.registeredAddress,
    businessCategory: t.businessCategory,
    invoiceType,
    environment: env,
  });

  const data = protectDevice({
    environment: env,
    vatNumber: t.vat,
    orgName: t.orgName,
    orgUnit: t.orgUnit,
    commonName: cn,
    serialNumber: serial,
    registeredAddress: t.registeredAddress,
    street: t.street,
    buildingNumber: t.buildingNumber,
    cityName: t.cityName,
    postalZone: t.postalZone,
    district: t.district,
    businessCategory: t.businessCategory,
    invoiceType,
    crNumber: t.crNumber,
    privateKeyPem: csr.privateKeyPem,
    csrPem: csr.csrPem,
    ccsidToken: null,
    ccsidSecret: null,
    pcsidToken: null,
    pcsidSecret: null,
    complianceRequestId: null,
    status: 'CSR',
    lastError: null,
    previousHash: FIRST_PIH,
    icv: 0,
  });

  const saved = await prisma.zatcaDevice.upsert({
    where: { tenantId: req.auth!.tenantId },
    create: { tenantId: req.auth!.tenantId, ...data } as any,
    update: data as any,
  });
  await prisma.tenant.update({ where: { id: req.auth!.tenantId }, data: { vatNumber: t.vat, companyName: t.orgName } });
  res.json({ device: publicDevice(await loadZatcaDeviceById(saved.id)) });
});

router.post('/compliance-csid', admin, async (req, res) => {
  const d = await loadZatcaDevice(req.auth!.tenantId);
  if (isProdLive(d)) return res.status(409).json({ error: 'الربط بالإنتاج فعّال. إصدار شهادة الامتثال مقفل.' });
  if (!d?.csrPem) return res.status(400).json({ error: 'ولّد طلب الشهادة (CSR) أولاً' });
  const otpRes = requireOtp(d.environment, req.body?.otp);
  if (!otpRes.ok) return res.status(400).json({ error: otpRes.error });
  const csrBase64 = Buffer.from(d.csrPem, 'utf8').toString('base64');
  const result = await zatcaApi.complianceCsid(d.environment, csrBase64, otpRes.otp);
  if (!result.ok) {
    await prisma.zatcaDevice.update({ where: { id: d.id }, data: { lastError: redactZatcaText(result.raw), status: 'CSR' } });
    return res.status(result.status || 400).json({ error: 'رفض إصدار شهادة الامتثال', detail: redactZatcaText(JSON.stringify(result.data || {})) });
  }
  const updated = await prisma.zatcaDevice.update({
    where: { id: d.id },
    data: protectDevice({
      ccsidToken: result.data.binarySecurityToken,
      ccsidSecret: result.data.secret,
      complianceRequestId: String(result.data.requestID || result.data.requestId || ''),
      status: 'CCSID',
      lastError: null,
    }),
  });
  res.json({ device: publicDevice(await loadZatcaDeviceById(updated.id)) });
});

router.post('/compliance-invoices', admin, async (req, res) => {
  try {
    const d = await loadZatcaDevice(req.auth!.tenantId);
    if (isProdLive(d)) return res.status(409).json({ error: 'الربط بالإنتاج فعّال. إرسال فواتير الامتثال مقفل.' });
    if (!d?.ccsidToken || !d.ccsidSecret) return res.status(400).json({ error: 'أصدر شهادة الامتثال أولاً' });
    const out = await sendComplianceInvoices(d as any);
    res.json({ ok: out.allOk, results: out.results });
  } catch (e: any) {
    res.status(500).json({ error: 'تعذر توقيع أو إرسال فواتير الامتثال', detail: redactZatcaText(String(e?.message || e), 800) });
  }
});

router.post('/production-csid', admin, async (req, res) => {
  const d = await loadZatcaDevice(req.auth!.tenantId);
  if (isProdLive(d)) return res.status(409).json({ error: 'شهادة الإنتاج صادرة ومقفلة. لا يُعاد إصدارها من هذه الخطوة.' });
  if (!d?.ccsidToken || !d.ccsidSecret || !d.complianceRequestId) {
    return res.status(400).json({ error: 'أكمل شهادة الامتثال وفواتير الامتثال أولاً' });
  }
  if (d.status !== 'COMPLIANCE') {
    return res.status(400).json({ error: 'لا تُصدر شهادة الإنتاج إلا بعد نجاح كل فواتير الامتثال' });
  }
  const result = await zatcaApi.productionCsid(d.environment, d.ccsidToken, d.ccsidSecret, d.complianceRequestId);
  if (!result.ok) {
    await prisma.zatcaDevice.update({ where: { id: d.id }, data: { lastError: redactZatcaText(result.raw) } });
    return res.status(result.status || 400).json({ error: 'رفض إصدار شهادة الإنتاج', detail: redactZatcaText(JSON.stringify(result.data || {})) });
  }
  const updated = await prisma.zatcaDevice.update({
    where: { id: d.id },
    data: protectDevice({
      pcsidToken: result.data.binarySecurityToken,
      pcsidSecret: result.data.secret,
      pcsidIssuedAt: new Date(),
      status: 'ACTIVE',
      lastError: null,
    }),
  });
  res.json({ device: publicDevice(await loadZatcaDeviceById(updated.id)) });
});

router.post('/renew', admin, async (req, res) => {
  const d = await loadZatcaDevice(req.auth!.tenantId);
  const relink = await authorizeRelink(req, d, 'RENEW');
  if (relink) return res.status(409).json({ error: relink });
  if (!d?.pcsidToken || !d.pcsidSecret || !d.csrPem) return res.status(400).json({ error: 'لا توجد شهادة إنتاج لتجديدها' });
  const otpRes = requireOtp(d.environment, req.body?.otp);
  if (!otpRes.ok) return res.status(400).json({ error: otpRes.error });
  const csrBase64 = Buffer.from(d.csrPem, 'utf8').toString('base64');
  const result = await zatcaApi.renewCsid(d.environment, d.pcsidToken, d.pcsidSecret, csrBase64, otpRes.otp);
  if (!result.ok) return res.status(result.status || 400).json({ error: 'فشل التجديد', detail: redactZatcaText(JSON.stringify(result.data || {})) });
  const updated = await prisma.zatcaDevice.update({
    where: { id: d.id },
    data: protectDevice({
      pcsidToken: result.data.binarySecurityToken,
      pcsidSecret: result.data.secret,
      pcsidIssuedAt: new Date(),
      status: 'ACTIVE',
      lastError: null,
    }),
  });
  res.json({ device: publicDevice(await loadZatcaDeviceById(updated.id)) });
});

router.post('/connect', admin, async (req, res) => {
  const tenantId = req.auth!.tenantId;
  const existing = await loadZatcaDevice(tenantId);
  const relink = await authorizeRelink(req, existing, 'RECONFIGURE');
  if (relink) return res.status(409).json({ error: relink });
  if (existing?.status === 'ACTIVE' && !req.body?.reset) {
    return res.status(409).json({ error: 'الجهاز مفعّل مسبقاً. أكّد إعادة الربط (reset) إذا أردت شهادة جديدة.' });
  }

  const b = req.body || {};
  const env = ['sandbox', 'simulation', 'production'].includes(b.environment || existing?.environment)
    ? (b.environment || existing?.environment)
    : 'sandbox';
  const t = parseTaxpayer({ ...existing, ...b }, env);
  if (!t.ok) return res.status(400).json({ error: t.error });
  const otpRes = requireOtp(env, b.otp);
  if (!otpRes.ok) return res.status(400).json({ error: otpRes.error });

  try {
    const serial = `1-Jadara|2-EGS|3-${randomUUID()}`;
    const invoiceType = invoiceTypeForEnv(env, b.invoiceType);
    const cn =
      env === 'sandbox' ? 'TSTZATCA-Code-Signing' :
      env === 'simulation' ? 'PREZATCA-Code-Signing' :
      t.orgName;
    const csr = await generateCsr({
      vatNumber: t.vat, orgName: t.orgName, orgUnit: t.orgUnit,
      commonName: cn, serialNumber: serial,
      registeredAddress: t.registeredAddress,
      businessCategory: t.businessCategory,
      invoiceType, environment: env,
    });
    const data = protectDevice({
      environment: env, vatNumber: t.vat, orgName: t.orgName,
      orgUnit: t.orgUnit, commonName: cn, serialNumber: serial,
      registeredAddress: t.registeredAddress,
      street: t.street, buildingNumber: t.buildingNumber,
      cityName: t.cityName, postalZone: t.postalZone, district: t.district,
      businessCategory: t.businessCategory,
      invoiceType, crNumber: t.crNumber,
      privateKeyPem: csr.privateKeyPem, csrPem: csr.csrPem,
      ccsidToken: null, ccsidSecret: null, pcsidToken: null, pcsidSecret: null,
      complianceRequestId: null, status: 'CSR' as const, lastError: null, previousHash: FIRST_PIH, icv: 0,
    });
    let d = await prisma.zatcaDevice.upsert({
      where: { tenantId },
      create: { tenantId, ...data } as any,
      update: data as any,
    });
    d = (await loadZatcaDeviceById(d.id)) as any;
    await prisma.tenant.update({ where: { id: tenantId }, data: { vatNumber: t.vat, companyName: t.orgName } });
    if (!d?.csrPem) return res.status(500).json({ error: 'تعذّر توليد طلب الشهادة' });
    const csrBase64 = Buffer.from(d.csrPem, 'utf8').toString('base64');
    const ccsid = await zatcaApi.complianceCsid(d.environment, csrBase64, otpRes.otp);
    if (!ccsid.ok) {
      await prisma.zatcaDevice.update({ where: { id: d.id }, data: { lastError: redactZatcaText(ccsid.raw), status: 'CSR' } });
      return res.status(ccsid.status || 400).json({ error: 'رفض إصدار شهادة الامتثال', detail: redactZatcaText(JSON.stringify(ccsid.data || {})) });
    }
    d = await prisma.zatcaDevice.update({
      where: { id: d.id },
      data: protectDevice({
        ccsidToken: ccsid.data.binarySecurityToken,
        ccsidSecret: ccsid.data.secret,
        complianceRequestId: String(ccsid.data.requestID || ccsid.data.requestId || ''),
        status: 'CCSID', lastError: null,
      }),
    });
    d = (await loadZatcaDeviceById(d.id)) as any;
    const cmp = await sendComplianceInvoices(d as any);
    if (!cmp.allOk) {
      return res.status(400).json({ error: 'فواتير الامتثال لم تُقبل كلها', results: cmp.results });
    }
    d = (await loadZatcaDeviceById(d.id)) as any;
    if (!d?.ccsidToken || !d.ccsidSecret || !d.complianceRequestId) {
      return res.status(400).json({ error: 'فواتير الامتثال لم تكتمل' });
    }
    const pcsid = await zatcaApi.productionCsid(d.environment, d.ccsidToken, d.ccsidSecret, d.complianceRequestId);
    if (!pcsid.ok) {
      await prisma.zatcaDevice.update({ where: { id: d.id }, data: { lastError: redactZatcaText(pcsid.raw) } });
      return res.status(pcsid.status || 400).json({ error: 'رفض إصدار شهادة الإنتاج', detail: redactZatcaText(JSON.stringify(pcsid.data || {})), results: cmp.results });
    }
    d = await prisma.zatcaDevice.update({
      where: { id: d.id },
      data: protectDevice({
        pcsidToken: pcsid.data.binarySecurityToken,
        pcsidSecret: pcsid.data.secret,
        pcsidIssuedAt: new Date(),
        status: 'ACTIVE', lastError: null,
      }),
    });
    res.json({ ok: true, device: publicDevice(await loadZatcaDeviceById(d.id)), compliance: cmp.results });
  } catch (e: any) {
    res.status(500).json({ error: redactZatcaText(String(e?.message || e), 800) });
  }
});

router.get('/unsent', async (req, res) => {
  const year = Number(req.query.year);
  const quarter = Number(req.query.quarter);
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const y = Number.isInteger(year) ? year : now.getUTCFullYear();
  const q = Number.isInteger(quarter) ? quarter : Math.floor(now.getUTCMonth() / 3) + 1;
  if (y < 2020 || y > 2100 || q < 1 || q > 4) return res.status(400).json({ error: 'الربع غير صالح' });
  res.json(await unsentReport(req.auth!.tenantId, y, q));
});

router.post('/retry/:invoiceId', admin, async (req, res) => {
  const out = await submitExistingInvoice(req.auth!.tenantId, req.params.invoiceId);
  res.json(out);
});

router.post('/test-send', admin, async (req, res) => {
  try {
  const d = await loadZatcaDevice(req.auth!.tenantId);
  if (!d || d.status !== 'ACTIVE' || !d.pcsidToken || !d.pcsidSecret) {
    return res.status(400).json({ error: 'أكمل الربط حتى يصبح الجهاز نشطاً ثم أرسل فاتورة التجربة' });
  }
  if (d.environment === 'production') {
    return res.status(400).json({ error: 'فاتورة التجربة لا تُرسل على الإنتاج. استخدم فاتورة مبيعات حقيقية لهذه المنشأة.' });
  }
  const now = new Date();
  const icv = d.icv + 1;
  const uuid = newUuid();
  const standard = usesStandardClearance(d.invoiceType);
  const sealed = await stampInvoice({
    privateKeyPem: d.privateKeyPem,
    sellerName: d.orgName,
    vatNumber: d.vatNumber,
    certificateToken: d.pcsidToken,
    doc: {
      id: `TST-${now.getFullYear()}-${String(icv).padStart(6, '0')}`,
      uuid,
      issueDate: now.toISOString().slice(0, 10),
      issueTime: `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}:${pad2(now.getUTCSeconds())}`,
      typeCode: '388',
      ksaCode: standard ? '0100000' : '0200000',
      currency: 'SAR',
      icv,
      pih: d.previousHash || FIRST_PIH,
      seller: {
        name: d.orgName, vat: d.vatNumber, crn: d.crNumber || d.vatNumber,
        street: d.street, building: d.buildingNumber, city: d.cityName, postal: d.postalZone, district: d.district,
      },
      buyer: standard
        ? { name: 'Test buyer', vat: dummyBuyerVat(d.vatNumber) }
        : { name: 'Walk-in' },
      lines: [{ name: 'Test item', qty: 1, price: 100, lineNet: 100, vat: 15, lineGross: 115 }],
      subtotal: 100, vat: 15, total: 115,
    },
  });
  const result = standard
    ? await zatcaApi.clear(d.environment, d.pcsidToken, d.pcsidSecret, sealed.payload)
    : await zatcaApi.report(d.environment, d.pcsidToken, d.pcsidSecret, sealed.payload);
  await prisma.zatcaSubmission.create({
    data: {
      tenantId: d.tenantId, kind: standard ? 'CLEARANCE' : 'REPORTING', uuid, invoiceHash: sealed.invoiceHash, xml: sealed.xml,
      httpStatus: result.status, response: redactZatcaText(result.raw, 4000), status: result.ok ? 'OK' : 'FAILED',
    },
  });
  if (result.ok) {
    await prisma.zatcaDevice.update({ where: { id: d.id }, data: { previousHash: sealed.invoiceHash, icv, lastError: null } });
  } else {
    await prisma.zatcaDevice.update({ where: { id: d.id }, data: { lastError: redactZatcaText(result.raw) } });
  }
  res.status(result.ok ? 200 : 400).json({ ok: result.ok, httpStatus: result.status, data: result.data });
  } catch (e: any) {
    res.status(500).json({ error: 'تعذر إرسال فاتورة التجربة', detail: redactZatcaText(String(e?.message || e), 800) });
  }
});

export default router;
