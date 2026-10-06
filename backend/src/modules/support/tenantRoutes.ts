import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth } from '../../middleware/auth';
import { TICKET_CATEGORIES, categoryLabel, requestKindLabel } from './catalog';
import { notifySupportTicket } from '../../utils/mailer';

const router = Router();
router.use(requireAuth);

function parseAttachments(raw: any[]) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 5).map((a) => {
    const b64 = String(a.data || '').replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (buf.length > 4 * 1024 * 1024) throw new Error('حجم المرفق أكبر من 4 ميجا');
    return {
      filename: String(a.filename || 'file').slice(0, 120),
      mime: String(a.mime || 'application/octet-stream').slice(0, 80),
      data: buf,
    };
  }).filter((a) => a.data.length > 0);
}

function mapTicket(t: any) {
  return {
    id: t.id,
    category: t.category,
    categoryLabel: categoryLabel(t.category),
    subject: t.subject,
    status: t.status,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
    companyName: t.tenant?.companyName,
    opener: t.user?.nameAr,
    messages: (t.messages || []).map((m: any) => ({
      id: m.id,
      fromRole: m.fromRole,
      body: m.body,
      requestKind: m.requestKind,
      requestLabel: requestKindLabel(m.requestKind),
      createdAt: m.createdAt,
      attachments: (m.attachments || []).map((a: any) => ({ id: a.id, filename: a.filename, mime: a.mime })),
    })),
  };
}

router.get('/categories', (_req, res) => res.json(TICKET_CATEGORIES));

router.get('/', async (req, res) => {
  const list = await prisma.supportTicket.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { updatedAt: 'desc' },
    include: { messages: { orderBy: { createdAt: 'asc' }, include: { attachments: { select: { id: true, filename: true, mime: true } } } } },
  });
  res.json(list.map(mapTicket));
});

router.get('/:id', async (req, res) => {
  const t = await prisma.supportTicket.findFirst({
    where: { id: req.params.id, tenantId: req.auth!.tenantId },
    include: {
      user: { select: { nameAr: true } },
      messages: { orderBy: { createdAt: 'asc' }, include: { attachments: { select: { id: true, filename: true, mime: true } } } },
    },
  });
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  res.json(mapTicket(t));
});

router.post('/', async (req, res) => {
  const { category, subject, body, attachments } = req.body || {};
  if (!TICKET_CATEGORIES.some((c) => c.id === category)) return res.status(400).json({ error: 'اختر نوع المشكلة' });
  if (!String(subject || '').trim() || !String(body || '').trim()) return res.status(400).json({ error: 'أدخل عنوان المشكلة ووصفها' });
  let files: ReturnType<typeof parseAttachments> = [];
  try { files = parseAttachments(attachments); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const t = await prisma.supportTicket.create({
    data: {
      tenantId: req.auth!.tenantId,
      userId: req.auth!.userId,
      category,
      subject: String(subject).trim().slice(0, 160),
      status: 'OPEN',
      messages: {
        create: {
          fromRole: 'TENANT',
          body: String(body).trim(),
          attachments: { create: files },
        },
      },
    },
    include: { messages: { include: { attachments: { select: { id: true, filename: true, mime: true } } } } },
  });
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: req.auth!.tenantId }, select: { companyName: true } }),
    prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { nameAr: true, email: true } }),
  ]);
  notifySupportTicket({
    kind: 'new',
    companyName: tenant?.companyName || 'منشأة',
    opener: user?.nameAr,
    email: user?.email,
    category: categoryLabel(category),
    subject: t.subject,
    body: String(body).trim(),
    filenames: files.map((f) => f.filename),
  }).catch((e) => console.error('support notify error', e));
  res.status(201).json(mapTicket(t));
});

router.post('/:id/messages', async (req, res) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  if (t.status === 'RESOLVED') return res.status(409).json({ error: 'التذكرة مغلقة' });
  const body = String(req.body?.body || '').trim();
  if (!body && !(req.body?.attachments || []).length) return res.status(400).json({ error: 'اكتب رداً أو أرفق ملفاً' });
  let files: ReturnType<typeof parseAttachments> = [];
  try { files = parseAttachments(req.body?.attachments); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  await prisma.supportMessage.create({
    data: { ticketId: t.id, fromRole: 'TENANT', body: body || 'تم إرفاق ملفات', attachments: { create: files } },
  });
  const [tenant, user] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: req.auth!.tenantId }, select: { companyName: true } }),
    prisma.user.findUnique({ where: { id: req.auth!.userId }, select: { nameAr: true, email: true } }),
  ]);
  notifySupportTicket({
    kind: 'reply',
    companyName: tenant?.companyName || 'منشأة',
    opener: user?.nameAr,
    email: user?.email,
    category: categoryLabel(t.category),
    subject: t.subject,
    body: body || 'تم إرفاق ملفات',
    filenames: files.map((f) => f.filename),
  }).catch((e) => console.error('support notify error', e));
  const updated = await prisma.supportTicket.update({
    where: { id: t.id },
    data: { status: 'WAITING_OWNER' },
    include: { messages: { orderBy: { createdAt: 'asc' }, include: { attachments: { select: { id: true, filename: true, mime: true } } } } },
  });
  res.json(mapTicket(updated));
});

router.get('/:id/attachments/:attId', async (req, res) => {
  const t = await prisma.supportTicket.findFirst({ where: { id: req.params.id, tenantId: req.auth!.tenantId } });
  if (!t) return res.status(404).json({ error: 'غير موجود' });
  const a = await prisma.supportAttachment.findFirst({ where: { id: req.params.attId, message: { ticketId: t.id } } });
  if (!a) return res.status(404).json({ error: 'المرفق غير موجود' });
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.filename)}"`);
  res.send(Buffer.from(a.data));
});

export default router;
