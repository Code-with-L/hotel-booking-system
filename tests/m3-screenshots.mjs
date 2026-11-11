// M3 visual-evidence screenshots (desktop + mobile). Not part of e2e.
import { chromium } from '@playwright/test';

const OUT = 'C:/Users/leon2/Downloads/hotel booking system/m3-screenshots';

const run = async () => {
  const browser = await chromium.launch();

  const desk = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await desk.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await desk.screenshot({ path: `${OUT}/01-home-desktop.png` });

  await desk.goto('http://localhost:5173/rooms/valley-suite', { waitUntil: 'networkidle' });
  await desk.screenshot({ path: `${OUT}/02-rooms-valley-suite.png`, fullPage: true });

  await desk.goto('http://localhost:5173/availability?checkIn=2027-01-10&checkOut=2027-01-13&adults=2&children=0&rooms=1', { waitUntil: 'networkidle' });
  await desk.screenshot({ path: `${OUT}/03-availability.png` });

  // Mobile nav states
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  await mob.screenshot({ path: `${OUT}/04-home-mobile.png` });
  await mob.goto('http://localhost:5173/availability?checkIn=2027-01-10&checkOut=2027-01-13&adults=2&children=0&rooms=1', { waitUntil: 'networkidle' });
  await mob.screenshot({ path: `${OUT}/05-availability-mobile.png`, fullPage: true });
  const menuBtn = mob.getByLabel('Open menu');
  await menuBtn.click();
  await mob.waitForTimeout(900);
  await mob.screenshot({ path: `${OUT}/06-mobile-menu-open.png` });

  await browser.close();
  console.log('saved to', OUT);
};
run().catch((e) => { console.error(e); process.exit(1); });
