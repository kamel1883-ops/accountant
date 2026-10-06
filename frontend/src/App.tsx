import React from 'react';
import { AuthProvider } from './context/AuthContext';
import { OwnerAuthProvider } from './context/OwnerAuthContext';
import TenantApp from './TenantApp';
import OwnerApp from './owner/OwnerApp';
import { OWNER_PATH } from './config';
import { LangProvider } from './i18n';

// Simple path-based split — no router dependency needed for two top-level apps:
// OWNER_PATH (الافتراضي /owner-portal) → بوابة المالك (توثيق منفصل تماماً)
// anything else → the tenant accounting app
export default function App() {
  const isOwner = window.location.pathname === OWNER_PATH || window.location.pathname.startsWith(OWNER_PATH + '/');

  if (isOwner) {
    return (
      <LangProvider>
        <OwnerAuthProvider>
          <OwnerApp />
        </OwnerAuthProvider>
      </LangProvider>
    );
  }
  return (
    <LangProvider>
      <AuthProvider>
        <TenantApp />
      </AuthProvider>
    </LangProvider>
  );
}
