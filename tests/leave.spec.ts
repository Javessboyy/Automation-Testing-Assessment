import { test, expect, Locator, Page } from '@playwright/test';

// Jeda 5 detik setelah tiap test case, biar demo publik ini tidak diserbu
// request beruntun (sempat melambat drastis sampai test timeout).
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(5_000);
});


const BASE_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php';
const LOGIN_URL = `${BASE_URL}/auth/login`;
const ADD_EMPLOYEE_URL = `${BASE_URL}/pim/addEmployee`;
const LEAVE_TYPE = 'CAN - Vacation';

/**
 * Isi input tanggal OrangeHRM mengikuti format yang sedang dipakai instance-nya.
 * Format ini bisa diubah dari Admin > Configuration > Localization (di demo publik
 * sempat berubah dari yyyy-dd-mm ke yyyy-mm-dd), jadi polanya dibaca dari
 * placeholder input, bukan di-hardcode.
 */
async function fillDate(input: Locator, date: Date) {
  const pattern = (await input.getAttribute('placeholder')) ?? 'yyyy-mm-dd';
  const value = pattern
    .replace('yyyy', String(date.getFullYear()))
    .replace('dd', String(date.getDate()).padStart(2, '0'))
    .replace('mm', String(date.getMonth() + 1).padStart(2, '0'));

  await input.fill(value);
  return value;
}

const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

/**
 * Hari kerja ke-n dihitung mulai hari ini (n=0 -> hari kerja pertama mulai hari
 * ini, n=1 -> hari kerja berikutnya sesudah itu, dst — Sabtu/Minggu dilompati).
 * OrangeHRM menolak leave request yang tanggalnya sama sekali tidak beririsan
 * hari kerja ("No Working Days Selected"). Test ini dulu pakai daysFromToday(0)
 * dan daysFromToday(1) ("hari ini"/"besok"), yang selalu gagal kalau kebetulan
 * dijalankan pas weekend karena keduanya jatuh di Sabtu & Minggu.
 */
const workday = (n: number) => {
  const date = new Date();
  const skipWeekend = () => {
    if (isWeekend(date)) date.setDate(date.getDate() + (date.getDay() === 6 ? 2 : 1));
  };

  skipWeekend();
  for (let i = 0; i < n; i++) {
    date.setDate(date.getDate() + 1);
    skipWeekend();
  }
  return date;
};

/**
 * Bikin pegawai baru sebagai target cuti.
 *
 * OrangeHRM menolak leave request yang tanggalnya beririsan dengan cuti yang sudah
 * ada ("Failed to Submit"). Kalau semua test memakai pegawai yang sama dengan
 * tanggal mulai hari ini, test kedua dan seterusnya pasti gagal — termasuk saat
 * suite ini dijalankan ulang. Jadi tiap test memakai pegawainya sendiri.
 */
async function createEmployee(page: Page) {
  const firstName = `Qa${Math.random().toString(36).slice(2, 8)}`;
  const lastName = 'Leave';

  await page.goto(ADD_EMPLOYEE_URL);
  await expect(page.getByRole('heading', { name: 'Add Employee' })).toBeVisible();
  await page.locator('input[name="firstName"]').fill(firstName);
  await page.locator('input[name="lastName"]').fill(lastName);

  // Employee Id auto-generate-nya kadang bentrok dengan pegawai yang sudah ada di
  // demo ("Employee Id already exists") dan bikin Save gagal. Field ini opsional,
  // jadi dikosongkan saja — setup ini tidak peduli id-nya.
  const employeeId = page
    .locator('.oxd-input-field-bottom-space', { has: page.getByText('Employee Id', { exact: true }) })
    .first()
    .locator('input');
  await expect(employeeId).not.toHaveValue('');
  await employeeId.fill('');

  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page).toHaveURL(/\/pim\/viewPersonalDetails\/empNumber\/\d+/, { timeout: 30_000 });

  return { firstName, fullName: new RegExp(`${firstName}\\s+${lastName}`, 'i') };
}

async function login(page: Page) {
  await page.goto(LOGIN_URL);
  await page.locator('input[name="username"]').fill('Admin');
  await page.locator('input[name="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
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
async function pickFromSelect(wrapper: Locator, option: string) {
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

async function selectOption(page: Page, label: string, option: string) {
  await pickFromSelect(fieldByLabel(page, label).locator('.oxd-select-wrapper'), option);
}

/** Klik menu Leave -> Assign Leave. */
async function openAssignLeave(page: Page) {
  await page.getByRole('link', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/leave\/viewLeaveList/);

  await page.getByRole('link', { name: 'Assign Leave' }).click();
  await expect(page).toHaveURL(/\/leave\/assignLeave/);
  await expect(page.getByRole('heading', { name: 'Assign Leave' })).toBeVisible();
}

/** Ketik hint di autocomplete Employee Name lalu pilih suggestion-nya. */
async function pickEmployee(page: Page, hint: string, name: RegExp) {
  const input = page.getByPlaceholder('Type for hints...');
  await input.fill(hint);
  await page.locator('.oxd-autocomplete-dropdown [role="option"]', { hasText: name }).first().click();
  await expect(input).toHaveValue(name);
}

/**
 * Isi From Date / To Date. Datepicker harus ditutup dengan klik ke luar —
 * menutupnya pakai Escape membatalkan input dan tanggalnya balik kosong.
 */
async function setDateRange(page: Page, from: Date, to: Date) {
  const fromInput = fieldByLabel(page, 'From Date').locator('input');
  const toInput = fieldByLabel(page, 'To Date').locator('input');
  const outside = page.getByRole('heading', { name: 'Assign Leave' });

  const fromValue = await fillDate(fromInput, from);
  await outside.click();
  const toValue = await fillDate(toInput, to);
  await outside.click();

  await expect(fromInput).toHaveValue(fromValue);
  await expect(toInput).toHaveValue(toValue);
}

/** Submit form dan setujui konfirmasi kalau balance pegawainya tidak mencukupi. */
async function assignLeave(page: Page, comment: string) {
  await page.locator('textarea').fill(comment);
  await page.getByRole('button', { name: 'Assign' }).click();

  // Jeda sengaja dilewati dari sini sampai pengecekan toast: toast OrangeHRM cuma
  // tampil ~3 detik, menunggu 5 detik dulu bikin toast-nya keburu hilang.
  // Balance pegawai demo sering tidak mencukupi -> muncul dialog "Confirm Leave
  // Assignment" yang harus di-Ok dulu sebelum data tersimpan.
  const confirm = page.getByRole('button', { name: 'Ok' });
  await confirm.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
  if (await confirm.isVisible()) await confirm.click();

  await expect(page.locator('.oxd-toast')).toContainText(/Successfully Saved/i, { timeout: 20_000 });
}

test.describe('Fitur Leave', { tag: ['@positive', '@functional'] }, () => {
  let employee: { firstName: string; fullName: RegExp };

  test.beforeEach(async ({ page }) => {
    await login(page);
    employee = await createEmployee(page);
    await openAssignLeave(page);
  });

  test('User add new assign Leave', async ({ page }) => {
    // Employee Name: ketik namanya, lalu pilih dari suggestion
    await pickEmployee(page, employee.firstName, employee.fullName);

    // Leave Type
    await selectOption(page, 'Leave Type', LEAVE_TYPE);

    // From Date & To Date dua hari kerja berturut-turut
    await setDateRange(page, workday(0), workday(1));

    // Rentang lebih dari sehari -> yang muncul field Partial Days, bukan Duration.
    // Dibiarkan default (tanpa partial) supaya semua harinya dihitung full day.
    await expect(fieldByLabel(page, 'Partial Days')).toBeVisible();

    await assignLeave(page, `Komen QA ${Date.now()}`);
  });

  test('User add new assign leave Today', async ({ page }) => {
    await pickEmployee(page, employee.firstName, employee.fullName);
    await selectOption(page, 'Leave Type', LEAVE_TYPE);

    // From Date dan To Date sama-sama hari kerja terdekat
    await setDateRange(page, workday(0), workday(0));

    // Cuti sehari -> system menampilkan field Duration
    await expect(fieldByLabel(page, 'Duration')).toBeVisible();
    await selectOption(page, 'Duration', 'Full Day');

    await assignLeave(page, `Komen QA ${Date.now()}`);
  });

  test('User add new assign leave more than 1 day', async ({ page }) => {
    await pickEmployee(page, employee.firstName, employee.fullName);
    await selectOption(page, 'Leave Type', LEAVE_TYPE);

    // From Date hari kerja terdekat, To Date dua hari kerja setelahnya
    await setDateRange(page, workday(0), workday(2));

    // System menampilkan Partial Days -> pilih Start Day Only
    await expect(fieldByLabel(page, 'Partial Days')).toBeVisible();
    await selectOption(page, 'Partial Days', 'Start Day Only');

    // Durasi hari pertama. Pilihan "Full Day" tidak tersedia di sini — partial day
    // memang hanya menawarkan setengah hari / jam tertentu.
    await expect(fieldByLabel(page, 'Start Day')).toBeVisible();
    await selectOption(page, 'Start Day', 'Half Day - Morning');

    await assignLeave(page, `Komen QA ${Date.now()}`);
  });
});
