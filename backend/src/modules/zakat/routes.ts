import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { calcZakatBase } from '../../utils/zakat';
import { buildBalances, sumBy, netProfitOf } from '../../utils/accounting';

const router = Router();
router.use(requireAuth);

// GET /api/zakat — الوعاء الزكوي بطريقة مصادر الأموال، مبني على أنواع الحسابات لا أرقامها
router.get('/', async (req, res) => {
  const { rows } = await buildBalances(req.auth!.tenantId, { includeClosing: false });
  const capital = sumBy(rows, (r) => r.subtype === 'CAPITAL');
  const reserves = sumBy(rows, (r) => r.subtype === 'RESERVES');
  const retainedEarnings = sumBy(rows, (r) => r.subtype === 'RETAINED_EARNINGS');
  const longTermLoans = sumBy(rows, (r) => r.subtype === 'NON_CURRENT_LIABILITY');
  const netProfit = netProfitOf(rows);
  const fixedAssetsNet = sumBy(rows, (r) => r.subtype === 'NON_CURRENT_ASSET') - sumBy(rows, (r) => r.subtype === 'CONTRA_ASSET');
  const longTermInvestments = 0;

  const inputs = { capital, reserves, retainedEarnings, longTermLoans, netProfit, fixedAssetsNet, longTermInvestments };
  res.json({ inputs: { ...inputs, retained: retainedEarnings, loans: longTermLoans }, ...calcZakatBase(inputs) });
});

export default router;
