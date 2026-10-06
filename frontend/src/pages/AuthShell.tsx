import React from 'react';
import { LangToggle, useI18n } from '../i18n';

export function AuthShell({ title, subtitle, children, wide }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className={`bg-white border border-[#E7E5DE] rounded-2xl p-8 w-full ${wide ? 'max-w-2xl' : 'max-w-sm'}`}>
        <div className="flex justify-end mb-2"><LangToggle light /></div>
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2.5 mb-2">
            <span className="w-[46px] h-[46px] rounded-xl border-[1.5px] border-[#C6A15B] bg-[#151340] flex items-center justify-center shrink-0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C6A15B" strokeWidth="1.6" aria-hidden><path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z" /><path d="M6 20h12" /></svg>
            </span>
            <div className="text-start">
              <h1 className="font-bold text-[22px] leading-tight">{t('brand')}</h1>
              <p className="text-sm text-[#C6A15B] leading-tight">{t('brandSub')}</p>
            </div>
          </div>
          <h2 className="font-bold mt-4">{title}</h2>
          {subtitle && <p className="text-xs text-[#6C6A82] mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputCls = 'w-full border border-[#E7E5DE] rounded-lg p-2.5 text-sm';
export const labelCls = 'text-xs text-[#6C6A82] block mb-1';
export const btnCls = 'w-full bg-gold text-navy font-bold rounded-lg py-2.5 text-sm disabled:opacity-60';
