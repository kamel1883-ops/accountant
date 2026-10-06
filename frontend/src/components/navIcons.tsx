import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  dash: <><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" /></>,
  pos: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M11 10h2M7 14h10" /></>,
  sales: <><path d="M4 19V9M10 19V5M16 19v-7M20 19H3" /></>,
  purchases: <><circle cx="9" cy="19" r="1.4" /><circle cx="17" cy="19" r="1.4" /><path d="M3 4h2l2.2 10h11.3l1.8-7H7" /></>,
  accounts: <><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2V4z" /><path d="M5 18a2 2 0 0 1 2-2h11" /></>,
  journal: <><path d="M8 3v3M16 3v3M4 8h16" /><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 12h8M8 16h5" /></>,
  trial: <><path d="M12 3v18M4 7h16M7 7l-2 7h6l-2-7M17 7l-2 7h6l-2-7" /></>,
  statements: <><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M8 13h8M8 17h5" /></>,
  products: <><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M3 8v8l9 4 9-4V8M12 12v8" /></>,
  warehouses: <><path d="M3 20V9l9-5 9 5v11" /><path d="M9 20v-6h6v6" /></>,
  centers: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>,
  stockcount: <><path d="M8 4h8v4H8zM6 8h12v12H6z" /><path d="M9 13h6M9 16h4" /></>,
  finance: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  reports: <><path d="M4 19h16M7 16V9M12 16V5M17 16v-4" /></>,
  reconcile: <><path d="M4 7h16M4 12h10M4 17h16" /><path d="M17 10l3 2-3 2" /></>,
  periods: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 10h16" /></>,
  vat: <><path d="M19 5 5 19M7.5 8.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM16.5 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" /></>,
  zakat: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5c.6-1 3.4-1.2 4.2.2.7 1.2-.2 2-2.1 2.3-1.8.3-2.8 1-2.2 2.2.7 1.3 3.6 1.2 4.4.1" /></>,
  zatca: <><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9 13h6M9 17h4" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19" /><circle cx="17" cy="9" r="2.2" /><path d="M16 14.6c1.8.3 3.2 1.4 3.8 3.4" /></>,
  export: <><path d="M12 4v10M8 10l4 4 4-4" /><path d="M5 18h14" /></>,
  health: <><path d="M12 3 5 6v5c0 4.2 2.8 7.2 7 9 4.2-1.8 7-4.8 7-9V6l-7-3z" /><path d="M9 12l2 2 4-4" /></>,
  support: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2" /></>,
  discounts: <><path d="M4 12V5h7l9 9-7 7-9-9z" /><circle cx="8.5" cy="8.5" r="1.2" /></>,
  cash: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  ar: <><circle cx="9" cy="8" r="3" /><path d="M4 19c.7-3 2.6-4.5 5-4.5s4.3 1.5 5 4.5" /><path d="M17 8v6M14.5 11H19.5" /></>,
  ap: <><path d="M4 19V8l8-4 8 4v11" /><path d="M9 19v-5h6v5" /></>,
  profit: <><path d="M4 16l5-5 3 3 7-7" /><path d="M14 7h5v5" /></>,
};

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {body}
    </svg>
  );
}
