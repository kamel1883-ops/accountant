import { money } from '../i18n';

export type MonthPoint = { year: number; month: number; sales: number; purchases: number; expenses: number; profit: number };

const BLUE = '#1D4E89';
const GOLD = '#C4A35A';
const RED = '#C0392B';
const GREEN = '#1F7A4D';
const TEAL = '#2E6B8A';

export function monthLabel(year: number, month: number, lang: string) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', {
    month: 'short', timeZone: 'UTC', numberingSystem: 'latn',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function CompareBars({
  items, rtl,
}: {
  items: { label: string; value: number; color: string }[];
  rtl: boolean;
}) {
  const w = 560;
  const h = 280;
  const padL = 16;
  const padR = 16;
  const padT = 36;
  const padB = 48;
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const slot = innerW / items.length;
  const barW = Math.min(54, slot * 0.46);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((p) => {
        const y = padT + innerH * (1 - p);
        return <line key={p} x1={padL} x2={w - padR} y1={y} y2={y} stroke="#EEF1F4" />;
      })}
      {items.map((item, i) => {
        const slotIndex = rtl ? items.length - 1 - i : i;
        const x = padL + slot * slotIndex + (slot - barW) / 2;
        const height = Math.max((Math.abs(item.value) / max) * innerH, item.value ? 4 : 0);
        const y = padT + innerH - height;
        return (
          <g key={item.label}>
            <rect x={x} y={y} width={barW} height={height} rx="8" fill={item.color} />
            <text x={x + barW / 2} y={y - 8} textAnchor="middle" fill="#1E1B4B" fontSize="12" fontWeight="700">{money(item.value)}</text>
            <text x={x + barW / 2} y={h - 16} textAnchor="middle" fill="#5C5A70" fontSize="12">{item.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const clean = slices.map((s) => ({ ...s, value: Math.max(0, s.value) })).filter((s) => s.value > 0);
  const total = clean.reduce((s, x) => s + x.value, 0);
  const r = 68;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-5">
      <svg viewBox="0 0 180 180" className="w-44 h-44 shrink-0" role="img">
        <g transform="rotate(-90 90 90)">
          {total === 0 ? <circle cx="90" cy="90" r={r} fill="none" stroke="#E7E5DE" strokeWidth="22" /> : clean.map((s) => {
            const len = (s.value / total) * c;
            const gap = clean.length > 1 ? 3 : 0;
            const el = (
              <circle key={s.label} cx="90" cy="90" r={r} fill="none" stroke={s.color} strokeWidth="22" strokeLinecap="butt"
                strokeDasharray={`${Math.max(len - gap, 0)} ${c}`} strokeDashoffset={-offset}>
                <title>{`${s.label}: ${money(s.value)}`}</title>
              </circle>
            );
            offset += len;
            return el;
          })}
        </g>
      </svg>
      <div className="flex flex-col gap-2 min-w-0 w-full text-sm">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span dir="ltr" className="font-mono text-xs shrink-0 text-[#5C5A70]">{total ? Math.round((Math.max(s.value, 0) / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Trend({ months, lang, label }: { months: MonthPoint[]; lang: string; label: string }) {
  const w = 760;
  const h = 250;
  const padL = 44;
  const padR = 12;
  const padT = 18;
  const padB = 32;
  const values = months.map((m) => m.sales);
  const max = Math.max(1, ...values, 0);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const xOf = (i: number) => padL + (months.length <= 1 ? innerW / 2 : (innerW * i) / (months.length - 1));
  const yOf = (v: number) => padT + innerH - (Math.max(v, 0) / max) * innerH;
  const line = months.map((m, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(m.sales)}`).join(' ');
  const area = months.length ? `${line} L ${xOf(months.length - 1)} ${padT + innerH} L ${xOf(0)} ${padT + innerH} Z` : '';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label={label}>
      <defs>
        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={BLUE} stopOpacity="0.35" />
          <stop offset="100%" stopColor={BLUE} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((p) => {
        const y = padT + innerH * (1 - p);
        return (
          <g key={p}>
            <line x1={padL} x2={w - padR} y1={y} y2={y} stroke="#EEF1F4" />
            <text x={padL - 8} y={y + 4} textAnchor="end" fill="#8A879C" fontSize="11">{p === 0 ? '0' : p === 1 ? money(max).replace(/\.00$/, '') : ''}</text>
          </g>
        );
      })}
      {area && <path d={area} fill="url(#salesFill)" />}
      {line && <path d={line} fill="none" stroke={BLUE} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />}
      {months.map((m, i) => (
        <g key={`${m.year}-${m.month}`}>
          <circle cx={xOf(i)} cy={yOf(m.sales)} r="3.5" fill="#fff" stroke={BLUE} strokeWidth="2">
            <title>{`${monthLabel(m.year, m.month, lang)}: ${money(m.sales)}`}</title>
          </circle>
          <text x={xOf(i)} y={h - 8} textAnchor="middle" fill="#5C5A70" fontSize="11">{monthLabel(m.year, m.month, lang)}</text>
        </g>
      ))}
    </svg>
  );
}

export const CHART = { BLUE, GOLD, RED, GREEN, TEAL };
