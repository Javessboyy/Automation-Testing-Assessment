import { test, expect, Page } from '@playwright/test';

// Jeda 5 detik setelah tiap test case, biar demo publik ini tidak diserbu
// request beruntun (sempat melambat drastis sampai test timeout).
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(5_000);
});


const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';

async function login(page: Page) {
  await page.goto(LOGIN_URL);
  await page.waitForTimeout(5000);
  await page.locator('input[name="username"]').fill('Admin');
  await page.waitForTimeout(5000);
  await page.locator('input[name="password"]').fill('admin123');
  await page.waitForTimeout(5000);
  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(5000);
  await expect(page).toHaveURL(/\/dashboard\/index/, { timeout: 30_000 });
}

/** Field OrangeHRM dicari lewat label-nya (tidak ada atribut id/name yang stabil). */
function fieldByLabel(page: Page, label: string) {
  return page
    .locator('.oxd-input-field-bottom-space', { has: page.getByText(label, { exact: true }) })
    .first();
}

/**
 * Klik satu opsi pada oxd-select. Pencarian opsi di-scope ke wrapper select-nya —
 * kalau dicari page-wide, klik bisa nyasar ke dropdown lain yang kebetulan terbuka.
 */
async function selectOption(page: Page, label: string, option: string) {
  const wrapper = fieldByLabel(page, label).locator('.oxd-select-wrapper');
  const value = wrapper.locator('.oxd-select-text-input');

  await expect(async () => {
    await wrapper.locator('.oxd-select-text').click();
    await wrapper
      .locator('.oxd-select-dropdown [role="option"]')
      .filter({ hasText: option })
      .first()
      .click({ timeout: 3_000 });
    await expect(value).toHaveText(option, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Ketik hint di autocomplete Employee Name lalu pilih suggestion pertama. */
async function pickEmployee(page: Page, hint: string) {
  const input = page.getByPlaceholder('Type for hints...');

  await expect(async () => {
    await input.fill(hint);

    const option = page
      .locator('.oxd-autocomplete-dropdown [role="option"]')
      .filter({ hasNotText: /Searching|No Records Found/i })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click({ timeout: 3_000 });
    await expect(input).not.toHaveValue(hint, { timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
}

/** Klik menu Claim, lalu tab Assign Claim (form Create Claim Request). */
async function openAssignClaim(page: Page) {
  await page.getByRole('link', { name: 'Claim' }).click();
  await page.waitForTimeout(5000);

  await page.locator('.oxd-topbar-body-nav-tab', { hasText: 'Assign Claim' }).first().click();
  await page.waitForTimeout(5000);
  await expect(page).toHaveURL(/\/claim\/assignClaim/);
  await expect(page.getByRole('heading', { name: 'Create Claim Request' })).toBeVisible();
}

test.describe('Fitur Claim', { tag: ['@positive', '@functional'] }, () => {
  test('User add new assign claim', async ({ page }) => {
    await login(page);
    await openAssignClaim(page);

    // Employee Name: ketik "a", pilih dari suggestion yang muncul
    await pickEmployee(page, 'a');

    // Event dan Currency
    await selectOption(page, 'Event', 'Accommodation');
    await selectOption(page, 'Currency', 'Algerian Dinar');

    // Remarks
    await page.locator('textarea').fill(`Remark QA ${Date.now()}`);
    await page.waitForTimeout(5000);

    // Klik button Create
    await page.getByRole('button', { name: 'Create' }).click();

    // Verifikasi: toast sukses, lalu redirect ke halaman detail claim yang baru dibuat
    await expect(page.locator('.oxd-toast')).toContainText(/Successfully Saved/i, { timeout: 20_000 });
    await expect(page).toHaveURL(/\/claim\/assignClaim\/id\/\d+/, { timeout: 30_000 });
  });
});

test.describe('Fitur Claim - Negatif case', { tag: ['@negative', '@validation'] }, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openAssignClaim(page);
  });

  test('Create Claim Request without entering Employee Name', async ({ page }) => {
    // Employee Name sengaja dikosongkan
    await selectOption(page, 'Event', 'Accommodation');
    await selectOption(page, 'Currency', 'Algerian Dinar');
    await page.locator('textarea').fill(`Remark QA ${Date.now()}`);

    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(5000);

    await expect(
      fieldByLabel(page, 'Employee Name').locator('.oxd-input-field-error-message'),
    ).toHaveText('Required');
  });

  test('Create Claim Request without entering Event', async ({ page }) => {
    await pickEmployee(page, 'a');
    // Event sengaja dikosongkan
    await selectOption(page, 'Currency', 'Algerian Dinar');
    await page.locator('textarea').fill(`Remark QA ${Date.now()}`);

    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(5000);

    await expect(fieldByLabel(page, 'Event').locator('.oxd-input-field-error-message')).toHaveText(
      'Required',
    );
  });

  test('Create Claim Request without entering Currency', async ({ page }) => {
    await pickEmployee(page, 'a');
    await selectOption(page, 'Event', 'Accommodation');
    // Currency sengaja dikosongkan
    await page.locator('textarea').fill(`Remark QA ${Date.now()}`);

    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForTimeout(5000);

    await expect(fieldByLabel(page, 'Currency').locator('.oxd-input-field-error-message')).toHaveText(
      'Required',
    );
  });
});
