// M4 admin-workflow screenshots (desktop + mobile). Not part of e2e.
import { chromium } from '@playwright/test';

const OUT = 'C:/Users/leon2/Downloads/hotel booking system/m4-screenshots';

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  const page = await ctx.newPage();

  await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  await page.getByLabel('Staff email').fill('admin@thestillhouse.example');
  await page.getByLabel('Password').fill('StillhouseAdmin!26');
  await page.getByRole('button', { name: /Sign in/ }).click();
  await page.waitForURL(/\/admin$/, { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/01-dashboard-desktop.png`, fullPage: true });

  await page.goto('http://localhost:5173/admin/reservations', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/02-reservations-desktop.png`, fullPage: true });

  // Open the reservation detail drawer for the first row
  const viewBtn = page.getByRole('button', { name: /^View details for/ }).first();
  if (await viewBtn.count()) {
    await viewBtn.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/03-reservation-drawer.png` });
    await page.getByRole('button', { name: 'Close details' }).click();
  }

  await page.goto('http://localhost:5173/admin/rooms', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/04-rooms-desktop.png`, fullPage: true });
  const historyBtn = page.getByRole('button', { name: /^History for room/ }).first();
  if (await historyBtn.count()) {
    await historyBtn.click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/05-room-history-drawer.png` });
    await page.getByRole('button', { name: 'Close history' }).click();
  }

  await page.goto('http://localhost:5173/admin/financials', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/06-financials-desktop.png`, fullPage: true });

  await page.goto('http://localhost:5173/admin/guests', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/07-guests-desktop.png`, fullPage: true });

  // Mobile: dashboard readability
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  await mob.getByLabel('Staff email').fill('admin@thestillhouse.example');
  await mob.getByLabel('Password').fill('StillhouseAdmin!26');
  await mob.getByRole('button', { name: /Sign in/ }).click();
  await mob.waitForTimeout(1200);
  await mob.screenshot({ path: `${OUT}/08-dashboard-mobile.png`, fullPage: true });

  await browser.close();
  console.log('saved to', OUT);
};
run().catch((e) => { console.error(e); process.exit(1); });
