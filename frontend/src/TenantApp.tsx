import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { IdleGuard } from './components/IdleGuard';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useI18n } from './i18n';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import CustomerPortal from './pages/CustomerPortal';
import Dashboard from './pages/Dashboard';
import ChartOfAccounts from './pages/ChartOfAccounts';
import Journal from './pages/Journal';
import VatReturn from './pages/VatReturn';
import Zakat from './pages/Zakat';
import Products from './pages/Products';
import Warehouses from './pages/Warehouses';
import CostCenters from './pages/CostCenters';
import StockCount from './pages/StockCount';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Reconcile from './pages/Reconcile';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Pos from './pages/Pos';
import TrialBalance from './pages/TrialBalance';
import Statements from './pages/Statements';
import Periods from './pages/Periods';
import Health from './pages/Health';
import Zatca from './pages/Zatca';
import Support from './pages/Support';
import Users from './pages/Users';
import DiscountCodes from './pages/DiscountCodes';
import ExportData from './pages/ExportData';

export default function TenantApp() {
  const { user, customer, logout } = useAuth();
  const { t } = useI18n();
  const [view, setView] = useState('dash');

  if (!user) {
    const path = window.location.pathname;
    if (path.startsWith('/register')) return <Register />;
    if (path.startsWith('/forgot-password')) return <ForgotPassword />;
    if (path.startsWith('/reset-password')) return <ResetPassword />;
    if (path.startsWith('/account') || customer) return customer ? <CustomerPortal /> : <Login />;
    return <Login />;
  }

  const navKeys = user.role === 'ADMIN'
    ? ['dash', 'pos', 'sales', 'purchases', 'accounts', 'journal', 'trial', 'statements',
      'products', 'warehouses', 'centers', 'stockcount', 'finance', 'reports', 'reconcile', 'periods', 'vat', 'zakat', 'zatca', 'users', 'export', 'health', 'support', 'discounts']
    : ['dash', 'pos', 'sales', 'purchases', 'accounts', 'journal', 'trial', 'statements',
      'products', 'warehouses', 'centers', 'stockcount', 'finance', 'reports', 'reconcile', 'periods', 'vat', 'zakat', 'zatca', 'health', 'support'];

  const pages: Record<string, React.ComponentType> = {
    dash: Dashboard, pos: Pos, sales: Sales, purchases: Purchases,
    accounts: ChartOfAccounts, journal: Journal, trial: TrialBalance, statements: Statements, periods: Periods, health: Health, products: Products, warehouses: Warehouses, centers: CostCenters,
    stockcount: StockCount, finance: Finance, reports: Reports, reconcile: Reconcile,
    vat: VatReturn, zakat: Zakat, zatca: Zatca, users: Users, export: ExportData, discounts: DiscountCodes, support: Support,
  };
  const Page = pages[view] || Dashboard;

  return (
    <Layout title={t('brandSub')} roleLabel={t(`role.${user.role}`)} nav={navKeys.map((k) => ({ key: k, label: t(`nav.${k}`) }))} active={view} onNavigate={setView} onLogout={logout}>
      <IdleGuard onLogout={logout} tokenKey="jadara_token" />
      <ErrorBoundary resetKey={view}>
        <Page />
      </ErrorBoundary>
    </Layout>
  );
}
