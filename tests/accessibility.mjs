// M5 — Accessibility verification with axe-core against the production build.
// Requires the built site (npm run build) served at :4173 and the API at :4000.
// Usage: node tests/accessibility.mjs
// Output: console summary + JSON report (../m5-rehearsal/accessibility-report.json)
import { chromium } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const axePath = require.resolve('axe-core/axe.min.js');
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../m5-rehearsal');
fs.mkdirSync(outDir, { recursive: true });

const BASE = process.env.A11Y_BASE_URL || 'http://localhost:4173';
const API = process.env.E2E_API_URL || 'http://localhost:4000';

const staffCreds = { email: 'admin@thestillhouse.example', password: 'StillhouseAdmin!26' };

const pagesToScan = [
  { name: 'home', url: '/' },
  { name: 'rooms', url: '/rooms/valley-suite' },
  { name: 'availability', url: '/availability?checkIn=2027-02-10&checkOut=2027-02-12&adults=2&children=0&rooms=1' },
  { name: 'booking-review', url: '/booking/review?room=valley-suite&plan=flexible&checkIn=2027-02-10&checkOut=2027-02-12&adults=2&children=0&rooms=1' },
  { name: 'account-signin', url: '/account' },
  { name: 'admin-signin', url: '/admin' },
  { name: 'admin-dashboard', url: '/admin', staff: true },
  { name: 'admin-financials', url: '/admin/financials', staff: true },
];

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const report = { url: BASE, executedAt: new Date().toISOString(), tool: 'axe-core 4.10.2 via Playwright', pages: [], totals: { critical: 0, serious: 0, moderate: 0, minor: 0 } };

  const signInStaff = async (page) => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    // Already signed in within this context? The field set means the staff area is up.
    const field = page.getByLabel('Staff email');
    if (await field.count() === 0) return; // already authenticated in this browser context
    await field.fill(staffCreds.email);
    await page.getByLabel('Password').fill(staffCreds.password);
    await page.getByRole('button', { name: /Sign in/ }).click();
    await page.waitForTimeout(1200);
  };

  for (const spec of pagesToScan) {
    const page = await context.newPage();
    if (spec.staff) await signInStaff(page);
    await page.goto(`${BASE}${spec.url}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.addScriptTag({ path: axePath });
    const violations = await page.evaluate(async () => {
      const results = await window.axe.run(document, {
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      });
      return results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
    });
    const summary = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of violations) summary[v.impact] = (summary[v.impact] || 0) + 1;
    for (const k of Object.keys(report.totals)) report.totals[k] += summary[k] || 0;
    report.pages.push({ page: spec.name, url: spec.url, violations });
    console.log(`${spec.name.padEnd(16)} critical=${summary.critical} serious=${summary.serious} moderate=${summary.moderate} minor=${summary.minor}${violations.length ? '  [' + violations.map((v) => v.id).join(', ') + ']' : ''}`);
    await page.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(outDir, 'accessibility-report.json'), JSON.stringify(report, null, 2));
  console.log(`\nTotals: critical=${report.totals.critical} serious=${report.totals.serious} moderate=${report.totals.moderate} minor=${report.totals.minor}`);
  console.log(`Report: ${path.join(outDir, 'accessibility-report.json')}`);
  process.exitCode = report.totals.critical > 0 || report.totals.serious > 0 ? 1 : 0;
};
run().catch((e) => { console.error(e); process.exit(1); });
