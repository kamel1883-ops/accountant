import React, { createContext, useContext, useState } from 'react';
import { ownerApi } from '../api/client';

interface OwnerCtx {
  ownerName: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<OwnerCtx | null>(null);

export function OwnerAuthProvider({ children }: { children: React.ReactNode }) {
  const [ownerName, setOwnerName] = useState<string | null>(() => localStorage.getItem('jadara_owner_name'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(email: string, password: string) {
    setLoading(true); setError(null);
    try {
      const res = await ownerApi.login(email, password);
      localStorage.setItem('jadara_owner_token', res.token);
      localStorage.setItem('jadara_owner_name', res.name);
      setOwnerName(res.name);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  function logout() {
    localStorage.removeItem('jadara_owner_token');
    localStorage.removeItem('jadara_owner_name');
    setOwnerName(null);
  }

  return <Ctx.Provider value={{ ownerName, loading, error, login, logout }}>{children}</Ctx.Provider>;
}

export function useOwnerAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOwnerAuth must be used within OwnerAuthProvider');
  return ctx;
}
