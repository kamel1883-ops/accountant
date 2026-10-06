export function money(n: number) {
  return (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

// التاريخ الهجري (أم القرى) بصيغة: 17 ربيع الآخر 1448
export function hijri(d: Date) {
  const parts = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${get('day')} ${get('month')} ${get('year')}`;
}

export function gregorianLong(d: Date) {
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
}

export function addMonths(d: Date, months: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + months);
  return r;
}

export function durationText(months: number) {
  return months === 12 ? 'سنة كاملة (12 شهراً)' : months % 12 === 0 ? `${months / 12} سنوات (${months} شهراً)` : `${months} شهراً`;
}
