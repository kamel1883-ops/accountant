import fs from 'fs';
import path from 'path';

const TEMPLATES_DIR = process.env.TEMPLATES_DIR || path.resolve(process.cwd(), 'templates');
const ASSETS_DIR = process.env.ASSETS_DIR || path.resolve(process.cwd(), 'assets');

export function esc(v: unknown) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const EMPTY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

export function assetDataUri(file: string) {
  try {
    const buf = fs.readFileSync(path.join(ASSETS_DIR, file));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return `data:image/png;base64,${EMPTY_PNG}`;
  }
}

// {{key}} = نص مُهرَّب، {{{key}}} = HTML خام (يُستخدم فقط لقيم نبنيها نحن داخل الكود)
export function render(templateFile: string, vars: Record<string, unknown>) {
  const html = fs.readFileSync(path.join(TEMPLATES_DIR, templateFile), 'utf8');
  return html
    .replace(/\{\{\{(\w+)\}\}\}/g, (_m, k) => String(vars[k] ?? ''))
    .replace(/\{\{(\w+)\}\}/g, (_m, k) => esc(vars[k]));
}

export const LOGO_SVG = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#C6A15B" stroke-width="1.6"><path d="M3 8l4 4 5-7 5 7 4-4-2 10H5L3 8z"/><path d="M6 20h12"/></svg>`;
