import React, { useState } from 'react';
import { useOwnerAuth } from '../context/OwnerAuthContext';
import { Layout } from '../components/Layout';
import { IdleGuard } from '../components/IdleGuard';
import { OWNER_PATH } from '../config';
import { useI18n } from '../i18n';
import OwnerLogin from './OwnerLogin';
import OwnerRecover from './OwnerRecover';
import OwnerOverview from './OwnerOverview';
import OwnerLeads from './OwnerLeads';
import OwnerTenants from './OwnerTenants';
import OwnerCodes from './OwnerCodes';
import OwnerRevenue from './OwnerRevenue';
import OwnerSupport from './OwnerSupport';
import OwnerAccount from './OwnerAccount';

const NAV_KEYS = ['overview', 'leads', 'tenants', 'support', 'codes', 'revenue', 'account'];

export default function OwnerApp() {
  const { ownerName, logout } = useOwnerAuth();
  const { t } = useI18n();
  const [view, setView] = useState('overview');
  const path = window.location.pathname;

  // شاشات الاستعادة متاحة دون تسجيل دخول
  if (path === `${OWNER_PATH}/forgot`) return <OwnerRecover mode="forgot" />;
  if (path === `${OWNER_PATH}/reset`) return <OwnerRecover mode="reset" />;
  if (!ownerName) return <OwnerLogin />;

  const pages: Record<string, React.ReactNode> = {
    overview: <OwnerOverview go={setView} />, leads: <OwnerLeads />, tenants: <OwnerTenants />,
    support: <OwnerSupport />, codes: <OwnerCodes />, revenue: <OwnerRevenue />, account: <OwnerAccount />,
  };

  return (
    <Layout mobileDrawer title={t('ownerPortal')} nav={NAV_KEYS.map((key) => ({ key, label: t(`own.nav.${key}`) }))} active={view} onNavigate={setView} onLogout={logout}>
      <IdleGuard onLogout={logout} tokenKey="jadara_owner_token" />
      {pages[view]}
    </Layout>
  );
}
