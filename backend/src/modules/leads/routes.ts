import { Router } from 'express';
import { prisma } from '../../config/db';
import { notifyOwnerNewLead } from '../../utils/mailer';
import { PLANS } from '../documents/plans';
import { normalizeUnified } from '../../utils/unifiedNumber';
import { parseCrImage } from '../../utils/crImage';
import { dropPendingByIdentity, unifiedBlock } from '../../utils/leadLifecycle';

const router = Router();

// POST /api/leads — public, no auth. This is what the landing-page signup form posts to.
router.post('/', async (req, res) => {
  const { companyName, email, phone, activity, requestType } = req.body;
  if (!companyName || !email || !phone) {
    return res.status(400).json({ error: 'أكمل جميع الحقول المطلوبة' });
  }
  const unified = normalizeUnified(req.body.unifiedNumber);
  if (!unified.ok) return res.status(400).json({ error: unified.error });
  const cr = parseCrImage(req.body.crImage, req.body.crFilename);
  if ('error' in cr) return res.status(400).json({ error: cr.error });
  const held = await unifiedBlock(prisma, unified.value);
  if (held) return res.status(409).json({ error: held });
  const lead = await prisma.$transaction(async (tx) => {
    await dropPendingByIdentity(tx, unified.value, String(email).trim().toLowerCase());
    return tx.lead.create({
      data: {
        companyName, unifiedNumber: unified.value, email, phone, activity, requestType: requestType || 'trial',
        crMime: cr.mime, crFilename: cr.filename, crData: cr.bytes,
      },
    });
  });
  notifyOwnerNewLead({
    companyName,
    email,
    phone,
    unifiedNumber: unified.value,
    activity,
    plan: PLANS.BASIC.nameAr,
    requestType: lead.requestType,
  }).catch((e) => console.error('lead notify error', e));
  res.status(201).json({ message: 'تم استلام طلبك، بنتواصل معك قريباً', leadId: lead.id });
});

export default router;
