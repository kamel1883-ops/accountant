import { Router } from 'express';
import { prisma } from '../../config/db';
import { TICKET_CATEGORIES, categoryLabel, REQUEST_KINDS, requestKindLabel } from './catalog';

const router = Router();

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
    openerEmail: t.user?.email,
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

const include = {
  tenant: { select: { companyName: true } },
  user: { select: { nameAr: true, email: true } },
  messages: { orderBy: { createdAt: 'asc' as const }, include: { attachments: { select: { id: true, filename: true, mime: true } } } },
};

router.get('/categories', (_req, res) => res.json({ categories: TICKET_CATEGORIES, requestKinds: REQUEST_KINDS }));

router.get('/', async (_req, res) => {
  const list = await prisma.supportTicket.findMany({ orderBy: { updatedAt: 'desc' }, include });
  res.json(list.map(mapTicket));
});

router.get('/:id', async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id }, include });
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  res.json(mapTicket(t));
});

router.post('/:id/messages', async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  if (t.status === 'RESOLVED') return res.status(409).json({ error: 'التذكرة مغلقة' });
  const body = String(req.body?.body || '').trim();
  const requestKind = REQUEST_KINDS.some((k) => k.id === req.body?.requestKind) ? req.body.requestKind : null;
  if (!body && !requestKind && !(req.body?.attachments || []).length) return res.status(400).json({ error: 'اكتب رسالة أو اطلب مرفقاً' });
  let files: ReturnType<typeof parseAttachments> = [];
  try { files = parseAttachments(req.body?.attachments); } catch (e: any) { return res.status(400).json({ error: e.message }); }

  const note = requestKind
    ? `شركة جداره للمحاسبة المالية تطلب منك: ${requestKindLabel(requestKind)}.`
    : '';
  await prisma.supportMessage.create({
    data: {
      ticketId: t.id,
      fromRole: 'OWNER',
      body: [note, body].filter(Boolean).join('\n\n'),
      requestKind,
      attachments: { create: files },
    },
  });
  const updated = await prisma.supportTicket.update({
    where: { id: t.id },
    data: { status: requestKind ? 'WAITING_CUSTOMER' : 'WAITING_CUSTOMER' },
    include,
  });
  res.json(mapTicket(updated));
});

router.post('/:id/resolve', async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'التذكرة غير موجودة' });
  const note = String(req.body?.body || 'تم حل الإشكالية من بوابة المالك.').trim();
  await prisma.supportMessage.create({
    data: { ticketId: t.id, fromRole: 'OWNER', body: note },
  });
  const updated = await prisma.supportTicket.update({
    where: { id: t.id },
    data: { status: 'RESOLVED', resolvedAt: new Date() },
    include,
  });
  res.json(mapTicket(updated));
});

router.get('/:id/attachments/:attId', async (req, res) => {
  const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
  if (!t) return res.status(404).json({ error: 'غير موجود' });
  const a = await prisma.supportAttachment.findFirst({ where: { id: req.params.attId, message: { ticketId: t.id } } });
  if (!a) return res.status(404).json({ error: 'المرفق غير موجود' });
  res.setHeader('Content-Type', a.mime);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(a.filename)}"`);
  res.send(Buffer.from(a.data));
});

export default router;
