import puppeteer, { Browser } from 'puppeteer';

let browser: Browser | null = null;

// يحوّل HTML إلى PDF (A4) عبر Chromium. على الـ VPS ثبّت خطوطاً عربية: apt install fonts-noto-core
export async function htmlToPdf(html: string): Promise<Buffer> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  }
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
