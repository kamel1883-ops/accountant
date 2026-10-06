import React, { useEffect, useState } from 'react';
import { useI18n, LangToggle } from '../i18n';
import { NavIcon } from './navIcons';

interface NavItem { key: string; label: string; }
export function Layout({
  title, nav, active, onNavigate, onLogout, children, roleLabel, mobileDrawer = false,
}: {
  title: string;
  nav: NavItem[];
  active: string;
  onNavigate: (key: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
  roleLabel?: string;
  /** على الجوال تُسحب القائمة كستارة وتُغلق بعد اختيار القسم */
  mobileDrawer?: boolean;
}) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);
  const rtl = lang === 'ar';

  useEffect(() => {
    if (!mobileDrawer || !open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileDrawer, open]);

  function pick(key: string) {
    onNavigate(key);
    setOpen(false);
  }

  const drawer = mobileDrawer
    ? `max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-40 max-md:w-[min(18rem,86vw)] max-md:overflow-y-auto max-md:transition-transform max-md:duration-200 max-md:shadow-xl md:static md:w-64 md:translate-x-0 md:pointer-events-auto ${open ? 'max-md:translate-x-0 max-md:pointer-events-auto' : 'max-md:-translate-x-full rtl:max-md:translate-x-full max-md:pointer-events-none'}`
    : '';

  return (
    <div className="flex min-h-screen">
      {mobileDrawer && open && (
        <button type="button" className="md:hidden fixed inset-0 z-30 bg-black/40 print:hidden" aria-label={t('menu.hide')} onClick={() => setOpen(false)} />
      )}
      {mobileDrawer && (
        <button
          type="button"
          className="md:hidden print:hidden fixed top-1/2 z-50 -translate-y-1/2 h-16 w-8 bg-navy text-[#E7D6AD] border border-[#C6A15B] shadow-md flex items-center justify-center rounded-e-xl transition-[inset-inline-start] duration-200"
          style={{ insetInlineStart: open ? 'min(18rem, 86vw)' : 0 }}
          aria-expanded={open}
          aria-controls="side-menu"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden className={open ? (rtl ? '' : 'rotate-180') : (rtl ? 'rotate-180' : '')}>
            <path d="M9 6l6 6-6 6" />
          </svg>
          <span className="sr-only">{open ? t('menu.hide') : t('menu.show')}</span>
        </button>
      )}
      <aside id="side-menu" className={`w-64 shrink-0 bg-navy text-white p-5 flex flex-col gap-5 sticky top-0 h-screen overflow-hidden ${drawer}`}>
        <div className="flex items-center gap-2">
          <span className="w-[46px] h-[46px] rounded-xl border-[1.5px] border-[#C6A15B] bg-[#151340] flex items-center justify-center shrink-0">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C6A15B" strokeWidth="1.6" aria-hidden>
              <path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z" />
              <path d="M6 20h12" />
            </svg>
          </span>
          <div>
            <div className="font-bold text-[22px] leading-tight">{t('brand')}</div>
            <div className="text-sm text-[#E7D6AD] leading-tight">{title}</div>
            {roleLabel && <div className="text-sm text-white/70 mt-0.5">{roleLabel}</div>}
          </div>
        </div>
        <nav className="flex-1 flex flex-col gap-0.5 overflow-y-auto min-h-0">
          {nav.map((n) => (
            <button
              key={n.key}
              onClick={() => pick(n.key)}
              className={`text-start px-3 py-2 rounded-lg text-base leading-snug transition flex items-center gap-2.5 ${
                active === n.key ? 'bg-gold text-navy font-bold' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <NavIcon name={n.key} />
              <span className="min-w-0">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 items-start">
          <LangToggle />
          <button onClick={onLogout} className="text-sm text-white/70 underline">{t('logout')}</button>
        </div>
      </aside>
      <main className={`flex-1 min-w-0 text-base ${mobileDrawer ? 'p-4 ps-11 md:p-8 overflow-x-auto' : 'p-8 overflow-x-hidden'}`}>{children}</main>
    </div>
  );
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white border border-[#E7E5DE] rounded-xl p-5 mb-4 ${className}`}>{children}</div>;
}

export function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#E7E5DE] rounded-xl p-4">
      <div className="text-[#6C6A82] text-sm">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}
