import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth';
import { buildCompanyZip } from './build';

const router = Router();
router.use(requireAuth);

router.get('/company', requireRole('ADMIN'), async (req, res) => {
  req.setTimeout(10 * 60 * 1000);
  res.setTimeout(10 * 60 * 1000);
  try {
    const { filename, buffer } = await buildCompanyZip(req.auth!.tenantId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="jadara-company.zip"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(buffer);
  } catch (e) {
    console.error('company export', e);
    if (!res.headersSent) res.status(500).json({ error: 'تعذّر تجهيز ملف تصدير المنشأة' });
  }
});

export default router;
