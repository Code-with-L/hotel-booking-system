// Quick visual sanity screenshots of the running app (not part of e2e).
import { chromium } from '@playwright/test';

const OUT = 'C:/Users/leon2/Downloads/hotel booking system/m1-screenshots';

const run = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/01-home.png` });

  await page.goto('http://localhost:5173/availability?checkIn=2026-12-20&checkOut=2026-12-23&adults=2&children=0&rooms=1', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/02-availability.png`, fullPage: false });

  await page.goto('http://localhost:5173/rooms', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/03-rooms.png` });

  // Admin: sign in then dashboard
  await page.goto('http://localhost:5173/admin', { waitUntil: 'networkidle' });
  await page.getByLabel('Staff email').fill('admin@thestillhouse.example');
  await page.getByLabel('Password').fill('StillhouseAdmin!26');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/04-admin-dashboard.png`, fullPage: true });

  await browser.close();
  console.log('screenshots saved to', OUT);
};
run().catch((e) => { console.error(e); process.exit(1); });
