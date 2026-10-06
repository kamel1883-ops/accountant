import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

const IDLE_MS = 5 * 60 * 1000;
const GRACE_MS = 60 * 1000;

/** بعد خمس دقائق بلا استخدام يسأل، وإن لم يُجب خلال ستين ثانية يُسجَّل خروجه. */
export function IdleGuard({ onLogout, tokenKey }: { onLogout: () => void; tokenKey: string }) {
  const { t } = useI18n();
  const [warn, setWarn] = useState(false);
  const [left, setLeft] = useState(60);
  const last = useRef(Date.now());
  const warning = useRef(false);
  const deadline = useRef(0);
  const logoutRef = useRef(onLogout);
  logoutRef.current = onLogout;

  useEffect(() => {
    const bump = () => {
      if (warning.current) return;
      last.current = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const onStorage = (e: StorageEvent) => {
      if (e.key === tokenKey && !e.newValue) logoutRef.current();
    };
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => {
      const now = Date.now();
      if (!warning.current) {
        if (now - last.current >= IDLE_MS) {
          warning.current = true;
          deadline.current = now + GRACE_MS;
          setWarn(true);
          setLeft(60);
        }
        return;
      }
      const remain = Math.ceil((deadline.current - now) / 1000);
      if (remain <= 0) {
        window.clearInterval(tick);
        logoutRef.current();
        return;
      }
      setLeft(remain);
    }, 250);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [tokenKey]);

  function stay() {
    warning.current = false;
    last.current = Date.now();
    setWarn(false);
    setLeft(60);
  }

  if (!warn) return null;
  return createPortal(
    <div className="fixed bottom-4 inset-x-0 z-[80] flex justify-center px-4 print:hidden">
      <div className="bg-white border border-navy rounded-lg shadow-lg px-4 py-3 w-full max-w-xs" role="alertdialog" aria-live="assertive">
        <p className="text-sm font-bold mb-1">{t('idle.ask')}</p>
        <p className="text-xs text-[#6C6A82] mb-3">{t('idle.left')} <b className="font-mono text-navy">{left}</b></p>
        <div className="flex gap-2">
          <button type="button" onClick={stay} className="text-xs bg-navy text-white rounded-lg px-3 py-1.5 font-bold">{t('idle.yes')}</button>
          <button type="button" onClick={() => logoutRef.current()} className="text-xs border border-[#E7E5DE] rounded-lg px-3 py-1.5">{t('idle.no')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
