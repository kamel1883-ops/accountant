import { Router } from 'express';
import { prisma } from '../../config/db';
import { requireAuth, requireRole } from '../../middleware/auth';

const router = Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const branches = await prisma.branch.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { createdAt: 'asc' } });
  res.json(branches);
});

router.post('/', requireRole('ADMIN'), async (req, res) => {
  const { nameAr, nameEn, isMain } = req.body;
  if (!nameAr) return res.status(400).json({ error: 'أدخل اسم الفرع' });
  const branch = await prisma.branch.create({ data: { tenantId: req.auth!.tenantId, nameAr, nameEn, isMain: !!isMain } });
  res.status(201).json(branch);
});

export default router;
