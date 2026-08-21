import { test, expect, Locator, Page } from '@playwright/test';

// Jeda 5 detik setelah tiap test case, biar demo publik ini tidak diserbu
// request beruntun (sempat melambat drastis sampai test timeout).
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(5_000);
});


const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';

/** PNG 1x1 untuk keperluan upload picture — tidak perlu file fixture terpisah. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const randomString = (length: number) =>
  Math.random().toString(36).slice(2, 2 + length).padEnd(length, 'x');

const randomName = (prefix: string) => `${prefix}${randomString(5)}`;

async function login(page: Page) {
  await page.goto(LOGIN_URL);
  await page.locator('input[name="username"]').fill('Admin');
  await page.locator('input[name="password"]').fill('admin123');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/dashboard\/index/, { timeout: 30_000 });
}

/** Klik menu PIM di sidebar. */
async function openPim(page: Page) {
  await page.getByRole('link', { name: 'PIM' }).click();
  await expect(page).toHaveURL(/\/pim\/viewEmployeeList/);
  await expect(page.getByRole('heading', { name: 'PIM' })).toBeVisible();
}

/** Field OrangeHRM dicari lewat label-nya (tidak ada atribut id/name yang stabil). */
function fieldByLabel(page: Page, label: string) {
  return page
    .locator('.oxd-input-field-bottom-space', { has: page.getByText(label, { exact: true }) })
    .first();
}

/** Pilih opsi pada dropdown OrangeHRM (oxd-select) berdasarkan label field-nya. */
async function selectOption(page: Page, label: string, option: string) {
  await pickFromSelect(fieldByLabel(page, label).locator('.oxd-select-wrapper'), option);
}

/**
 * Klik satu opsi pada oxd-select. Pencarian opsi di-scope ke wrapper select-nya —
 * kalau dicari page-wide, klik bisa nyasar ke dropdown lain yang kebetulan terbuka.
 */
async function pickFromSelect(wrapper: Locator, option?: string) {
  const value = wrapper.locator('.oxd-select-text-input');

  // Di-retry: form report me-render ulang komponennya setiap kali ada criterion /
  // display field ditambahkan, jadi klik pertama bisa mendarat di element yang
  // keburu di-replace dan tidak berefek apa-apa.
  await expect(async () => {
    await wrapper.locator('.oxd-select-text').click();
    const options = wrapper.locator('.oxd-select-dropdown [role="option"]');
    const target = option
      ? options.filter({ hasText: option }).first()
      : options.filter({ hasNotText: '-- Select --' }).first();
    await target.click({ timeout: 3_000 });
    await expect(value).not.toHaveText('-- Select --', { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  if (option) await expect(value).toHaveText(option);
}

/** Klik button "+" yang ada di baris field tertentu (Selection Criteria / Display Field). */
async function addButtonNear(page: Page, label: string) {
  await fieldByLabel(page, label)
    .locator('xpath=ancestor::div[contains(@class,"oxd-form-row")][1]')
    .locator('button:has(.bi-plus)')
    .first()
    .click();
}

/**
 * Isi dropdown nilai dari criterion yang baru ditambahkan (mis. Pay Grade).
 * Nilainya wajib — kalau dibiarkan kosong, Save akan gagal dengan error "Required".
 */
async function fillCriteriaValue(page: Page, criteria: string) {
  // Baris criterion dikenali dari icon trash-nya — dropdown "Selection Criteria" di
  // atasnya sempat menampilkan teks yang sama sebelum ter-reset ke "-- Select --".
  const nameCell = page
    .locator('.orangehrm-report-criteria', { has: page.locator('.bi-trash-fill') })
    .filter({ hasText: criteria })
    .first();
  await expect(nameCell).toBeVisible();

  // Nilai apa pun boleh, yang penting tidak kosong
  await pickFromSelect(nameCell.locator('xpath=following-sibling::div[1]').locator('.oxd-select-wrapper'));
}

/** Buka form Add Employee dan isi nama lengkapnya (field wajib). */
async function fillEmployeeName(page: Page) {
  const firstName = randomName('Qa');
  const middleName = randomName('Mid');
  const lastName = randomName('Test');

  await page.locator('input[name="firstName"]').fill(firstName);
  await page.locator('input[name="middleName"]').fill(middleName);
  await page.locator('input[name="lastName"]').fill(lastName);

  return { firstName, middleName, lastName };
}

test.describe('Fitur PIM', { tag: ['@positive', '@functional'] }, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openPim(page);
  });

  test('User add new employee', async ({ page }) => {
    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('heading', { name: 'Add Employee' })).toBeVisible();

    // Upload picture
    await page.locator('input[type="file"]').setInputFiles({
      name: 'avatar.png',
      mimeType: 'image/png',
      buffer: PNG_1PX,
    });

    // Input Employee Full Name (first / middle / last)
    const { firstName, lastName } = await fillEmployeeName(page);

    // Input Employee Id — field ini terisi otomatis secara async, tunggu dulu
    // sebelum di-fill supaya isian kita tidak ketimpa nilai bawaan.
    const employeeId = fieldByLabel(page, 'Employee Id').locator('input');
    await expect(employeeId).not.toHaveValue('');
    await employeeId.fill(randomString(4));

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Verifikasi lewat redirect ke halaman Personal Details pegawai baru.
    // Toast sukses tidak dipakai sebagai penanda: umurnya cuma ~3 detik, jadi bisa
    // keburu hilang sebelum sempat dicek kalau run-nya lambat.
    await expect(page).toHaveURL(/\/pim\/viewPersonalDetails\/empNumber\/\d+/, { timeout: 30_000 });
    // Nama di header diisi belakangan lewat request terpisah, beri waktu lebih
    const employeeName = page.locator('.orangehrm-edit-employee-name');
    await expect(employeeName).toContainText(firstName, { timeout: 20_000 });
    await expect(employeeName).toContainText(lastName);
  });

  test('User add new User login on fitur add employee', async ({ page }) => {
    const username = randomName('pimuser');
    const password = 'Testing123';

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('heading', { name: 'Add Employee' })).toBeVisible();

    // Nama pegawai tetap wajib diisi walau fokus test-nya di login details
    await fillEmployeeName(page);

    // Nyalakan toggle Create Login Details
    await page.locator('.oxd-switch-input').click();
    await expect(page.getByText('Create Login Details')).toBeVisible();

    // Input Username
    await fieldByLabel(page, 'Username').locator('input').fill(username);

    // Input Password + Confirm Password
    const passwordFields = page.locator('input[type="password"]');
    await passwordFields.nth(0).fill(password);
    await passwordFields.nth(1).fill(password);

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Verifikasi: pegawai baru tersimpan (redirect ke Personal Details)
    await expect(page).toHaveURL(/\/pim\/viewPersonalDetails\/empNumber\/\d+/, { timeout: 30_000 });
  });
});

test.describe('Fitur PIM - Reports', { tag: ['@positive', '@functional'] }, () => {
  test('User add new Report Employee', async ({ page }) => {
    const reportName = `Report QA ${Date.now()}`;

    await login(page);

    // Klik menu PIM
    await openPim(page);

    // Klik menu Reports di topbar
    await page.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/pim\/viewDefinedPredefinedReports/);

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page).toHaveURL(/\/pim\/definePredefinedReport/);
    await expect(page.getByRole('heading', { name: 'Add Report' })).toBeVisible();

    // Input Report Name (random supaya tidak bentrok dengan report yang sudah ada)
    await page.getByPlaceholder('Type here ...').fill(reportName);

    // Selection Criteria = Pay Grade, lalu klik button "+" untuk menambahkannya
    await selectOption(page, 'Selection Criteria', 'Pay Grade');
    await addButtonNear(page, 'Selection Criteria');
    await fillCriteriaValue(page, 'Pay Grade');

    // Include = Current and Past Employees
    await selectOption(page, 'Include', 'Current and Past Employees');

    // Display Field Group = Personal
    await selectOption(page, 'Select Display Field Group', 'Personal');

    // Display Field = Employee First Name, lalu klik button "+" Display Field
    await selectOption(page, 'Select Display Field', 'Employee First Name');
    await addButtonNear(page, 'Select Display Field');

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();

    // Verifikasi: setelah Save, OrangeHRM langsung menjalankan report-nya
    // (redirect ke displayPredefinedReport/<id>), bukan kembali ke list —
    // jadi tidak ada toast "Successfully Saved" di sini.
    await expect(page).toHaveURL(/\/pim\/displayPredefinedReport\/\d+/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: reportName })).toBeVisible();

    // Report baru juga harus tercatat di list Reports
    await page.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/pim\/viewDefinedPredefinedReports/);
    await expect(page.locator('.oxd-table-card', { hasText: reportName })).toBeVisible();
  });
});

/** Ambil Employee Id pertama yang tidak kosong dari list pegawai. */
async function firstEmployeeId(page: Page) {
  const rows = page.locator('.oxd-table-card');
  await expect(rows.first()).toBeVisible();

  const ids = await rows.locator('.oxd-table-cell').nth(1).allInnerTexts();
  const id = ids.map(value => value.trim()).find(Boolean);

  expect(id, 'butuh minimal satu pegawai yang punya Employee Id').toBeTruthy();
  return id as string;
}

test.describe('Fitur PIM - Negatif case', { tag: ['@negative', '@validation'] }, () => {
  test('User add new employee with Employee Id already exists', async ({ page }) => {
    await login(page);
    await openPim(page);

    // Ambil Employee Id yang sudah terpakai langsung dari list. Id tidak di-hardcode
    // karena data demo ini berubah terus — id yang hari ini ada besok bisa hilang,
    // dan test-nya akan lolos diam-diam (malah membuat pegawai baru).
    const existingId = await firstEmployeeId(page);

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.getByRole('heading', { name: 'Add Employee' })).toBeVisible();

    // Nama diisi valid supaya satu-satunya yang menahan submit adalah Employee Id
    await fillEmployeeName(page);

    // Isi Employee Id dengan id milik pegawai yang benar-benar ada.
    // Field ini terisi otomatis secara async, tunggu dulu sebelum di-fill.
    const employeeId = fieldByLabel(page, 'Employee Id').locator('input');
    await expect(employeeId).not.toHaveValue('');
    await employeeId.fill(existingId);

    // Cek duplikat dijalankan di server saat submit — blur saja tidak selalu memicunya
    await page.getByRole('button', { name: 'Save' }).click();

    // System menampilkan validasi, dan pegawainya tidak jadi dibuat
    await expect(fieldByLabel(page, 'Employee Id').locator('.oxd-input-field-error-message')).toHaveText(
      'Employee Id already exists',
      { timeout: 20_000 },
    );
    await expect(page).toHaveURL(/\/pim\/addEmployee/);
  });
});
