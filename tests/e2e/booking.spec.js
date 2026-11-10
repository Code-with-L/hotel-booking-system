// End-to-end journeys against the real stack: Vite (5173) -> Express (4000) -> PostgreSQL.
import { test, expect } from '@playwright/test';

const GUEST = { email: 'naomi.achieng@example.com', password: 'GuestPassword!26' };
const ADMIN = { email: 'admin@thestillhouse.example', password: 'StillhouseAdmin!26' };

const uniqueDates = () => {
  // Fresh far-future window so each run starts from a clean availability picture
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 200 + Math.floor(Math.random() * 60));
  const checkIn = base.toISOString().slice(0, 10);
  const out = new Date(base);
  out.setUTCDate(out.getUTCDate() + 3);
  const checkOut = out.toISOString().slice(0, 10);
  return { checkIn, checkOut };
};

test('guest journey: search -> book -> held reservation -> staff confirms -> guest sees confirmed', async ({ page, browser }) => {
  const { checkIn, checkOut } = uniqueDates();

  // 1. Search availability
  await page.goto(`/availability?checkIn=${checkIn}&checkOut=${checkOut}&adults=2&children=0&rooms=1`);
  await expect(page.getByRole('heading', { name: 'Choose your room.' })).toBeVisible();
  await expect(page.getByText('Garden Room').first()).toBeVisible({ timeout: 15_000 });

  // 2. Select the Garden Room, Flexible rate
  const card = page.locator('.result', { has: page.getByRole('heading', { name: 'The Garden Room' }) });
  await card.getByRole('button', { name: /Select The Garden Room, Flexible rate/ }).click();

  // 3. Guest details
  await expect(page).toHaveURL(/\/booking\/guest-details/);
  await page.getByLabel('First name').fill('Naomi');
  await page.getByLabel('Last name').fill('Achieng');
  await page.getByLabel('Email').fill(GUEST.email);
  await page.getByLabel('Phone number').fill('+254 712 000 042');
  await page.getByLabel('Country').selectOption('Kenya');
  await page.getByLabel('I have read the privacy notice.').check();
  await page.getByRole('button', { name: 'Continue to review' }).click();

  // 4. Review — price computed server-side
  await expect(page).toHaveURL(/\/booking\/review/);
  await expect(page.getByRole('heading', { name: 'Review your stay.' })).toBeVisible();
  await expect(page.getByText('VAT (16%)')).toBeVisible();
  await expect(page.getByText('Tourism levy (2%)')).toBeVisible();
  await page.getByLabel(/I have read and accept/).check();
  await page.getByRole('button', { name: 'Confirm reservation' }).click();

  // 5. Confirmation — booking held, payment pending
  await expect(page).toHaveURL(/\/booking\/confirmation/);
  await expect(page.getByText('BOOKING RECEIVED — PAYMENT PENDING')).toBeVisible();
  const refText = await page.locator('.confirmation__code').innerText();
  expect(refText).toMatch(/^STL-\d{4}-[A-Z2-9]{6}$/);

  // 6. Guest sees the pending booking in their account
  await page.goto('/account');
  await page.getByLabel('Email').fill(GUEST.email);
  await page.getByLabel('Password').fill(GUEST.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Hello, Naomi/ })).toBeVisible();
  await page.goto('/account/reservations');
  await expect(page.getByText(refText).first()).toBeVisible();

  // 7. Staff confirms the booking (desk settlement) — separate browser context as admin
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto('/admin');
  await admin.getByLabel('Staff email').fill(ADMIN.email);
  await admin.getByLabel('Password').fill(ADMIN.password);
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await expect(admin.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 15_000 });
  await admin.goto('/admin/reservations');
  await admin.getByLabel('Search reservations').fill(refText);
  await admin.getByRole('button', { name: `View details for ${refText}` }).click();
  await admin.getByLabel('Update status').selectOption('Confirmed');
  await expect(admin.getByLabel('Update status')).toHaveValue('Confirmed');
  await adminContext.close();

  // 8. Guest now sees it Confirmed
  await page.goto('/account/reservations');
  await expect(page.getByText('Confirmed').first()).toBeVisible();
});

test('failure path: unavailable party size and form validation', async ({ page }) => {
  // Party too large for one room — everyone shown as unavailable
  await page.goto('/availability?checkIn=2027-06-10&checkOut=2027-06-12&adults=9&children=0&rooms=1');
  await expect(page.getByText(/Not available for this party/i).first()).toBeVisible({ timeout: 15_000 });

  // Empty guest-form submit shows field errors, not a silent failure
  await page.goto('/availability?checkIn=2027-06-10&checkOut=2027-06-12&adults=2&children=0&rooms=1');
  await expect(page.getByText('Garden Room').first()).toBeVisible({ timeout: 15_000 });
  const card = page.locator('.result').first();
  await card.getByRole('button', { name: /Select / }).first().click();
  await page.getByRole('button', { name: 'Continue to review' }).click();
  await expect(page.getByText('Please enter your first name.')).toBeVisible();
});

test('authorization: admin area requires staff session', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Staff sign in.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toHaveCount(0);
});
