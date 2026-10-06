import express from 'express';
import cors from 'cors';
import authRoutes from './modules/auth/routes';
import accountsRoutes from './modules/accounts/routes';
import journalRoutes from './modules/journal/routes';
import vatRoutes from './modules/vat/routes';
import zakatRoutes from './modules/zakat/routes';
import leadsRoutes from './modules/leads/routes';
import ownerRoutes from './modules/owner/routes';
import customerRoutes from './modules/customer/routes';
import branchesRoutes from './modules/branches/routes';
import inventoryRoutes from './modules/inventory/routes';
import stockRoutes from './modules/stock/routes';
import financeRoutes from './modules/finance/routes';
import reportsRoutes from './modules/reports/routes';
import salesRoutes from './modules/sales/routes';
import saleDiscountRoutes from './modules/discounts/routes';
import purchasesRoutes from './modules/purchases/routes';
import statementsRoutes from './modules/statements/routes';
import periodsRoutes from './modules/periods/routes';
import zatcaRoutes from './modules/zatca/routes';
import supportTenantRoutes from './modules/support/tenantRoutes';
import usersRoutes from './modules/users/routes';
import exportRoutes from './modules/export/routes';
import costCenterRoutes from './modules/costCenters/routes';
import reconcileRoutes from './modules/reconcile/routes';

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'https://www.jadara-finance.com,https://jadara-finance.com')
  .split(',').map((s) => s.trim()).filter(Boolean);

app.set('trust proxy', 1);
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '8mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'jadara-finance-backend' }));

// Tenant-side (accounting) API — every route here requires a tenant-user JWT
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/journal', journalRoutes);
app.use('/api/vat', vatRoutes);
app.use('/api/zakat', zakatRoutes);
app.use('/api/branches', branchesRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/sale-discounts', saleDiscountRoutes);
app.use('/api/purchases', purchasesRoutes);
app.use('/api/statements', statementsRoutes);
app.use('/api/periods', periodsRoutes);
app.use('/api/zatca', zatcaRoutes);
app.use('/api/support', supportTenantRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/cost-centers', costCenterRoutes);
app.use('/api/reconcile', reconcileRoutes);

// Public — landing page signup form posts here, no auth
app.use('/api/leads', leadsRoutes);

// Owner portal — completely separate auth (Owner model, not User)
app.use('/api/owner', ownerRoutes);

// بوابة العميل قبل التفعيل: تسجيل، عرض السعر، حالة الطلب
app.use('/api/customer', customerRoutes);

// Placeholder for the future HR → Finance integration:
// HR will POST approved payroll/leave/end-of-service events here, and this
// endpoint will translate each one into a balanced JournalEntry automatically —
// the same auto-posting pattern already used by /api/sales and /api/purchases.
app.post('/api/integrations/hr/journal-entry', (_req, res) => {
  res.status(501).json({ error: 'لم يُفعَّل بعد — سيُبنى عند ربط نظام جداره HR' });
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  console.error('api error');
  res.status(500).json({ error: 'تعذر إكمال الطلب' });
});
