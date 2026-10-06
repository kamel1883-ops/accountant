import React, { createContext, useContext, useState } from 'react';
import { api } from '../api/client';

interface AuthUser { id: string; nameAr: string; role: 'ADMIN' | 'ACCOUNTANT' | 'VIEWER'; }
interface CustomerInfo { id: string; contactName: string; email: string; }
interface AuthCtx {
  user: AuthUser | null;
  customer: CustomerInfo | null;
  loading: boolean;
  error: string | null;
  needUnified: boolean;
  login: (email: string, password: string, unifiedNumber?: string) => Promise<void>;
  setCustomerSession: (token: string, customer: CustomerInfo) => void;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
function read(k: string) {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    localStorage.removeItem(k);
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => read('jadara_user'));
  const [customer, setCustomer] = useState<CustomerInfo | null>(() => read('jadara_customer'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needUnified, setNeedUnified] = useState(false);

  function setCustomerSession(token: string, c: CustomerInfo) {
    localStorage.setItem('jadara_token', token);
    localStorage.setItem('jadara_customer', JSON.stringify(c));
    localStorage.removeItem('jadara_user');
    setUser(null); setCustomer(c);
  }

  async function login(email: string, password: string, unifiedNumber?: string) {
    setLoading(true); setError(null);
    try {
      const res = await api.login(email, password, unifiedNumber);
      setNeedUnified(false);
      if (res.kind === 'customer') {
        setCustomerSession(res.token, res.customer);
      } else {
        localStorage.setItem('jadara_token', res.token);
        localStorage.setItem('jadara_user', JSON.stringify(res.user));
        localStorage.removeItem('jadara_customer');
        setCustomer(null); setUser(res.user);
      }
    } catch (e: any) {
      setError(e.message);
      setNeedUnified(!!e.needUnified);
    } finally {
      setLoading(false);
    }
  }
  function logout() {
    ['jadara_token', 'jadara_user', 'jadara_customer'].forEach((k) => localStorage.removeItem(k));
    setUser(null); setCustomer(null);
    window.location.href = '/login';
  }

  return <Ctx.Provider value={{ user, customer, loading, error, needUnified, login, setCustomerSession, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
