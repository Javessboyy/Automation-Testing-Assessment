import { test, expect, Page } from '@playwright/test';

// Jeda 5 detik setelah tiap test case, biar demo publik ini tidak diserbu
// request beruntun (sempat melambat drastis sampai test timeout).
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(5_000);
});


const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
const PASSWORD = 'Sepakbola12';

/** Username dipakai lintas test (serial): dibuat di Add, diubah di Edit, dihapus di Delete. */
let username = `qauser${Date.now()}`;

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

/** Buka menu Admin -> System Users. */
async function openAdmin(page: Page) {
  await page.getByRole('link', { name: 'Admin' }).click();
  await page.waitForTimeout(5000);
  await expect(page).toHaveURL(/\/admin\/viewSystemUsers/);
  await expect(page.getByRole('heading', { name: 'System Users' })).toBeVisible();
}

/** Field OrangeHRM dicari lewat label-nya (tidak ada atribut id/name yang stabil). */
function fieldByLabel(page: Page, label: string) {
  return page
    .locator('.oxd-input-field-bottom-space', { has: page.getByText(label, { exact: true }) })
    .first();
}

/** Pilih opsi pada dropdown OrangeHRM (oxd-select) berdasarkan label field-nya. */
async function selectOption(page: Page, label: string, option: string) {
  const field = fieldByLabel(page, label);
  await field.locator('.oxd-select-text').click();
  await page.waitForTimeout(5000);
  await page.locator('.oxd-select-dropdown [role="option"]', { hasText: option }).first().click();
  await page.waitForTimeout(5000);
  await expect(field.locator('.oxd-select-text-input')).toHaveText(option);
}

/**
 * Ketik hint di autocomplete lalu pilih suggestion pertama, dan kembalikan namanya.
 * Nama pegawai tidak di-hardcode: data demo publik ini berubah terus — pegawai yang
 * dipakai sebelumnya ("Ranga Akunuri") sempat hilang dan bikin test gantung 2 menit.
 */
async function pickFirstHint(page: Page, hint: string) {
  const input = page.getByPlaceholder('Type for hints...');
  let name = '';

  // Di-retry: dropdown-nya di-render ulang saat hasil pencarian datang, jadi klik
  // pertama bisa mendarat di element yang keburu diganti — suggestion terlihat
  // ter-klik padahal input balik ke teks yang diketik dan field jadi "Invalid".
  await expect(async () => {
    await input.fill(hint);

    // "Searching..." dan "No Records Found" juga muncul sebagai option, tapi
    // keduanya tidak bisa dipilih — klik ke situ diam-diam tidak berefek apa pun.
    const option = page
      .locator('.oxd-autocomplete-dropdown [role="option"]')
      .filter({ hasNotText: /Searching|No Records Found/i })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });

    name = (await option.innerText()).trim();
    await option.click({ timeout: 3_000 });
    await expect(input).not.toHaveValue(hint, { timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  return name;
}

/** Cari user di list System Users dan kembalikan baris hasilnya. */
async function searchUser(page: Page, name: string) {
  const input = fieldByLabel(page, 'Username').locator('input');
  await expect(input).toBeEnabled();
  await input.fill(name);
  await page.waitForTimeout(5000);
  // Tunggu response API-nya, bukan sekadar klik — tabel di-render ulang secara async
  await Promise.all([
    page.waitForResponse(
      r => r.request().method() === 'GET' && r.url().includes('/api/v2/admin/users'),
    ),
    page.getByRole('button', { name: 'Search' }).click(),
  ]);
  return page.locator('.oxd-table-card', { hasText: name });
}

// Serial: Add -> Edit -> Delete bekerja pada user yang sama.
test.describe.serial('Fitur Admin - User Management', { tag: '@positive' }, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openAdmin(page);
  });

  test('User add new users on user management', async ({ page }) => {
    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();

    // User Role = Admin
    await selectOption(page, 'User Role', 'Admin');

    // Employee Name: ketik "a", pilih dari suggestion yang muncul
    await pickFirstHint(page, 'a');

    // Status = Enabled
    await selectOption(page, 'Status', 'Enabled');

    // Username (random supaya tidak bentrok dengan user yang sudah ada)
    await fieldByLabel(page, 'Username').locator('input').fill(username);
    await page.waitForTimeout(5000);

    // Password + Confirm Password
    const passwordFields = page.locator('input[type="password"]');
    await passwordFields.nth(0).fill(PASSWORD);
    await page.waitForTimeout(5000);
    await passwordFields.nth(1).fill(PASSWORD);
    await page.waitForTimeout(5000);

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    // Verifikasi: kembali ke list dan user baru muncul di hasil pencarian
    await expect(page).toHaveURL(/\/admin\/viewSystemUsers/, { timeout: 30_000 });
    await expect(await searchUser(page, username)).toBeVisible();
  });

  test('User Edit data user', async ({ page }) => {
    const newUsername = `tesing${Date.now()}`;

    // Pakai data yang langsung muncul di list, tanpa search dulu.
    // Baris paling atas adalah akun yang dipakai login (username "Admin") — kalau
    // username-nya ikut diubah, semua test lain langsung gagal, jadi dilewati.
    const rows = page.locator('.oxd-table-card');
    await expect(rows.first()).toBeVisible();
    const row = rows.filter({ hasNotText: 'Admin' }).first();

    // Scroll sekali supaya barisnya masuk viewport
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(5000);

    // Klik button edit (icon pencil)
    await row.locator('.oxd-icon.bi-pencil-fill').click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Edit User' })).toBeVisible();

    // Form ini memuat data secara async, jadi tunggu nilainya terisi dulu — kalau
    // langsung di-fill, isian kita akan ketimpa data yang datang belakangan.
    const usernameInput = fieldByLabel(page, 'Username').locator('input');
    await expect(usernameInput).not.toHaveValue('');
    await usernameInput.fill(newUsername);
    await page.waitForTimeout(5000);

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    // Verifikasi: toast sukses dan kembali ke list System Users
    await expect(page.locator('.oxd-toast')).toContainText(/Successfully Updated/i);
    await expect(page).toHaveURL(/\/admin\/viewSystemUsers/, { timeout: 30_000 });
  });

  test('User Delete user', async ({ page }) => {
    // Cari user hasil test Add, lalu klik button delete (icon trash)
    const row = await searchUser(page, username);
    await row.locator('.oxd-icon.bi-trash').click();
    await page.waitForTimeout(5000);

    // Klik button konfirmasi "Yes, Delete"
    await expect(page.getByRole('button', { name: 'Yes, Delete' })).toBeVisible();
    await page.getByRole('button', { name: 'Yes, Delete' }).click();
    await page.waitForTimeout(5000);

    // Verifikasi: toast sukses dan user sudah tidak ada di list
    await expect(page.locator('.oxd-toast')).toContainText(/Successfully Deleted/i);
    await expect(await searchUser(page, username)).toHaveCount(0);
  });
});

test.describe('Fitur Admin - Job', { tag: '@positive' }, () => {
  test('User Add Job Category', async ({ page }) => {
    const categoryName = `Kategori QA ${Date.now()}`;

    await login(page);

    // Klik fitur Admin
    await openAdmin(page);

    // Klik menu Job -> Job Categories (dropdown di topbar)
    await page.locator('.oxd-topbar-body-nav-tab', { hasText: 'Job' }).first().click();
    await page.waitForTimeout(5000);
    await page.getByRole('menuitem', { name: 'Job Categories' }).click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/admin\/jobCategory/);
    await expect(page.getByRole('heading', { name: 'Job Categories' })).toBeVisible();

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Add Job Category' })).toBeVisible();

    // Input Name (random supaya tidak bentrok dengan kategori yang sudah ada)
    await fieldByLabel(page, 'Name').locator('input').fill(categoryName);
    await page.waitForTimeout(5000);

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    // Verifikasi: toast sukses dan kategori baru muncul di list
    await expect(page.locator('.oxd-toast')).toContainText(/Successfully Saved/i);
    await expect(page).toHaveURL(/\/admin\/jobCategory/, { timeout: 30_000 });
    await expect(page.locator('.oxd-table-card', { hasText: categoryName })).toBeVisible();
  });
});

test.describe('Fitur Admin - Negatif case', { tag: '@negative' }, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openAdmin(page);

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Add User' })).toBeVisible();
  });

  /** Validasi OrangeHRM muncul setelah field kehilangan fokus. */
  const blur = (page: Page) => page.getByRole('heading', { name: 'Add User' }).click();

  test('User add User use already Exists', async ({ page }) => {
    await fieldByLabel(page, 'Username').locator('input').fill('admin');
    await page.waitForTimeout(5000);
    await blur(page);

    await expect(fieldByLabel(page, 'Username').locator('.oxd-input-field-error-message')).toHaveText(
      'Already exists',
    );
  });

  test('User add user use Password without any numeric character', async ({ page }) => {
    await fieldByLabel(page, 'Password').locator('input').fill('sepakbola');
    await page.waitForTimeout(5000);
    await blur(page);

    await expect(fieldByLabel(page, 'Password').locator('.oxd-input-field-error-message')).toHaveText(
      'Your password must contain minimum 1 number',
    );
  });

  test('user enters a username with less than 5 characters', async ({ page }) => {
    await fieldByLabel(page, 'Username').locator('input').fill('1');
    await page.waitForTimeout(5000);
    await blur(page);

    await expect(fieldByLabel(page, 'Username').locator('.oxd-input-field-error-message')).toHaveText(
      'Should be at least 5 characters',
    );
  });

  test('User enter username with empty value', async ({ page }) => {
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(fieldByLabel(page, 'Username').locator('.oxd-input-field-error-message')).toHaveText(
      'Required',
    );
  });

  test('User enter password with less than 7 characters', async ({ page }) => {
    await fieldByLabel(page, 'Password').locator('input').fill('sep');
    await page.waitForTimeout(5000);
    await blur(page);

    await expect(fieldByLabel(page, 'Password').locator('.oxd-input-field-error-message')).toHaveText(
      'Should have at least 7 characters',
    );
  });

  test('user entered a confirmation password that does not match the password.', async ({ page }) => {
    await fieldByLabel(page, 'Password').locator('input').fill('Sepakbola12');
    await page.waitForTimeout(5000);
    await fieldByLabel(page, 'Confirm Password').locator('input').fill('Sap');
    await page.waitForTimeout(5000);
    await blur(page);

    await expect(
      fieldByLabel(page, 'Confirm Password').locator('.oxd-input-field-error-message'),
    ).toHaveText('Passwords do not match');
  });

  test('user enters the name of an unregistered employee.', async ({ page }) => {
    await page.getByPlaceholder('Type for hints...').fill('+++');
    await page.waitForTimeout(5000);
    await blur(page);

    await expect(
      fieldByLabel(page, 'Employee Name').locator('.oxd-input-field-error-message'),
    ).toHaveText('Invalid');
  });
});

test.describe('Fitur Admin - Negatif case Work Shift', { tag: '@negative' }, () => {
  test('User set To working hours input before from time', async ({ page }) => {
    await login(page);
    await openAdmin(page);

    // Klik menu Job -> Work Shifts
    await page.locator('.oxd-topbar-body-nav-tab', { hasText: 'Job' }).first().click();
    await page.waitForTimeout(5000);
    await page.getByRole('menuitem', { name: 'Work Shifts' }).click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/admin\/workShift/);

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Add Work Shift' })).toBeVisible();

    // From 09:00 AM, To 05:00 AM (lebih awal dari From).
    // Time picker ditutup dengan klik ke luar, bukan Escape — Escape membatalkan input.
    const times = page.locator('input[placeholder="hh:mm"]');
    const outside = page.getByRole('heading', { name: 'Add Work Shift' });
    await times.first().fill('09:00 AM');
    await page.waitForTimeout(5000);
    await outside.click();
    await page.waitForTimeout(5000);
    await times.nth(1).fill('05:00 AM');
    await page.waitForTimeout(5000);
    await outside.click();
    await page.waitForTimeout(5000);

    // System menampilkan validasi
    await expect(page.locator('.oxd-input-field-error-message')).toHaveText(
      'To time should be after from time',
    );
  });
});
