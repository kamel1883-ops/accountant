type Cell = string | number;
type Row = Cell[];

function textOf(el: Element) {
  const field = el.matches('input, select, textarea') ? el : el.querySelector('input, select, textarea');
  if (field && (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement)) {
    return field.value.replace(/\s+/g, ' ').trim();
  }
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}

function skipped(el: Element) {
  const tag = el.tagName;
  return tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'SVG' || tag === 'NAV';
}

function tableRows(table: HTMLTableElement): Row[] {
  const out: Row[] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells = Array.from(tr.children).filter((c) => c.tagName === 'TH' || c.tagName === 'TD');
    if (!cells.length) return;
    const row: string[] = [];
    cells.forEach((c) => {
      const span = Number((c as HTMLTableCellElement).colSpan || 1);
      row.push(textOf(c));
      for (let i = 1; i < span; i += 1) row.push('');
    });
    if (row.some(Boolean)) out.push(row);
  });
  return out;
}

function collect(root: Element): Row[] {
  const rows: Row[] = [];
  const walk = (el: Element) => {
    if (skipped(el) || el.classList.contains('hidden')) return;
    if (el.classList.contains('print:hidden')) {
      if (/^H[1-4]$/.test(el.tagName) || el.tagName === 'P') {
        const title = textOf(el);
        if (title) rows.push([title]);
      }
      return;
    }
    if (el.tagName === 'TABLE') {
      const body = tableRows(el as HTMLTableElement);
      if (body.length) {
        rows.push(...body);
        rows.push([]);
      }
      return;
    }
    if (el.classList.contains('justify-between')) {
      const kids = Array.from(el.children).filter((k) => !skipped(k));
      if (kids.length >= 2) {
        rows.push([textOf(kids[0]), textOf(kids[kids.length - 1])]);
        return;
      }
    }
    const second = el.children[1];
    if (el.children.length === 2 && second && typeof second.className === 'string' && second.className.includes('text-2xl')) {
      rows.push([textOf(el.children[0]), textOf(second)]);
      return;
    }
    if (/^H[1-4]$/.test(el.tagName)) {
      const title = textOf(el);
      if (title) rows.push([title]);
    }
    Array.from(el.children).forEach(walk);
  };
  walk(root);
  return rows;
}

function safeFile(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'تقرير';
}

export async function downloadReportExcel(title: string) {
  const main = document.querySelector('main');
  if (!main) throw new Error('empty');
  const rows = collect(main).filter((r) => r.some((c) => String(c).trim()));
  if (!rows.length) throw new Error('empty');
  const excel = await import('exceljs');
  const ExcelJS = excel.default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Jadara Finance';
  const ws = wb.addWorksheet('التقرير');
  ws.views = [{ rightToLeft: true }];
  const head = ws.addRow([title]);
  head.font = { bold: true, size: 14 };
  rows.forEach((r) => ws.addRow(r));
  ws.columns.forEach((col) => { col.width = 28; });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFile(title)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
