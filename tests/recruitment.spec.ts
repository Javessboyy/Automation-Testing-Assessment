import { test, expect, Locator, Page } from '@playwright/test';

// Jeda 5 detik setelah tiap test case, biar demo publik ini tidak diserbu
// request beruntun (sempat melambat drastis sampai test timeout).
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(5_000);
});


const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';
const VACANCY = 'Senior QA Lead';
// Ejaan di data demo memang begitu ("Automaton", bukan "Automation")
const JOB_TITLE = 'Automaton Tester';

/** PDF minimal untuk upload resume — tidak perlu file fixture terpisah. */
const RESUME_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
    '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
    'trailer<</Root 1 0 R>>\n%%EOF\n',
);

const randomString = (length: number) =>
  Math.random().toString(36).slice(2, 2 + length).padEnd(length, 'x');

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

/** Pesan error milik satu input tertentu (First Name / Last Name berbagi satu label). */
function errorOf(input: Locator) {
  return input
    .locator('xpath=ancestor::div[contains(@class,"oxd-input-group")][1]')
    .locator('.oxd-input-field-error-message');
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

/** Klik menu Recruitment di sidebar. */
async function openRecruitment(page: Page) {
  await page.getByRole('link', { name: 'Recruitment' }).click();
  await page.waitForTimeout(5000);
  await expect(page).toHaveURL(/\/recruitment\/viewCandidates/);
  await expect(page.getByRole('heading', { name: 'Recruitment' })).toBeVisible();
}

test.describe('Fitur Recruitment', { tag: ['@positive', '@functional'] }, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openRecruitment(page);
  });

  test('User add new Candidates', async ({ page }) => {
    const firstName = `Cand${randomString(5)}`;
    const lastName = `Test${randomString(5)}`;

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/recruitment\/addCandidate/);
    await expect(page.getByRole('heading', { name: 'Add Candidate' })).toBeVisible();

    // Full Name (first / middle / last)
    await page.locator('input[name="firstName"]').fill(firstName);
    await page.waitForTimeout(5000);
    await page.locator('input[name="middleName"]').fill(`Mid${randomString(4)}`);
    await page.waitForTimeout(5000);
    await page.locator('input[name="lastName"]').fill(lastName);
    await page.waitForTimeout(5000);

    // Vacancy
    await selectOption(page, 'Vacancy', VACANCY);

    // Email dan Contact Number
    await fieldByLabel(page, 'Email').locator('input').fill(`${randomString(8)}@example.com`);
    await page.waitForTimeout(5000);
    await fieldByLabel(page, 'Contact Number')
      .locator('input')
      .fill(`08${Math.floor(1_000_000_00 + Math.random() * 8_999_999_99)}`);
      await page.waitForTimeout(5000);

    // Upload Resume
    await page.locator('input[type="file"]').setInputFiles({
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      buffer: RESUME_PDF,
    });

    // Keywords
    await page.getByPlaceholder('Enter comma seperated words...').fill('qa,automation,playwright');
    await page.waitForTimeout(5000);

    // Date of Application: hari ini. Datepicker ditutup dengan klik ke luar —
    // menutupnya pakai Escape membatalkan input dan tanggalnya balik kosong.
    const dateInput = fieldByLabel(page, 'Date of Application').locator('input');
    const dateValue = await fillDate(dateInput, new Date());
    await page.getByRole('heading', { name: 'Add Candidate' }).click();
    await page.waitForTimeout(5000);
    await expect(dateInput).toHaveValue(dateValue);

    // Notes
    await page.locator('textarea').fill(`Catatan QA ${Date.now()}`);
    await page.waitForTimeout(5000);

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    // Verifikasi: kandidat tersimpan dan muncul di list Candidates
    await expect(page).toHaveURL(/\/recruitment\/addCandidate\/\d+/, { timeout: 30_000 });
    await openRecruitment(page);
    await fieldByLabel(page, 'Candidate Name').locator('input').fill(firstName);
    await page.waitForTimeout(5000);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForTimeout(5000);
    await expect(page.locator('.oxd-table-card', { hasText: lastName })).toBeVisible();
  });

  test('User add new Vacancy', async ({ page }) => {
    const vacancyName = `QA Automation Vacancy ${Date.now()}`;

    // Klik menu Vacancies
    await page.getByRole('link', { name: 'Vacancies' }).click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/recruitment\/viewJobVacancy/);

    // Klik button Add
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/recruitment\/addJobVacancy/);
    await expect(page.getByRole('heading', { name: 'Add Vacancy' })).toBeVisible();

    // Vacancy Name
    await fieldByLabel(page, 'Vacancy Name').locator('input').fill(vacancyName);
    await page.waitForTimeout(5000);

    // Job Title
    await selectOption(page, 'Job Title', JOB_TITLE);

    // Description
    await page.getByPlaceholder('Type description here').fill(`Deskripsi QA ${Date.now()}`);
    await page.waitForTimeout(5000);

    // Hiring Manager: ketik "a", pilih dari suggestion yang muncul
    await pickFirstHint(page, 'a');

    // Number of Positions
    await fieldByLabel(page, 'Number of Positions')
      .locator('input')
      .fill(String(1 + Math.floor(Math.random() * 9)));
      await page.waitForTimeout(5000);

    // Klik button Save
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    // Verifikasi: vacancy tersimpan dan muncul di list Vacancies
    await expect(page).toHaveURL(/\/recruitment\/addJobVacancy\/\d+/, { timeout: 30_000 });
    await page.getByRole('link', { name: 'Vacancies' }).click();
    await page.waitForTimeout(5000);
    // Filter "Vacancy" di list ini berupa dropdown, bukan input teks
    await selectOption(page, 'Vacancy', vacancyName);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.waitForTimeout(5000);
    await expect(page.locator('.oxd-table-card', { hasText: vacancyName })).toBeVisible();
  });
});

test.describe('Fitur Recruitment - Negatif case', { tag: ['@negative', '@validation'] }, () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await openRecruitment(page);
  });

  /** Buka form Add Candidate. */
  async function openAddCandidate(page: Page) {
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Add Candidate' })).toBeVisible();
  }

  /** Buka form Add Vacancy lewat menu Vacancies. */
  async function openAddVacancy(page: Page) {
    await page.getByRole('link', { name: 'Vacancies' }).click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/recruitment\/viewJobVacancy/);
    await page.getByRole('button', { name: 'Add' }).click();
    await page.waitForTimeout(5000);
    await expect(page.getByRole('heading', { name: 'Add Vacancy' })).toBeVisible();
  }

  test('User enter First Name with empty value on Add Candidate', async ({ page }) => {
    await openAddCandidate(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(errorOf(page.locator('input[name="firstName"]'))).toHaveText('Required');
  });

  test('User enter Last Name with empty value on Add Candidate', async ({ page }) => {
    await openAddCandidate(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(errorOf(page.locator('input[name="lastName"]'))).toHaveText('Required');
  });

  test('User enter Email with empty value on Add Candidate', async ({ page }) => {
    await openAddCandidate(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(fieldByLabel(page, 'Email').locator('.oxd-input-field-error-message')).toHaveText(
      'Required',
    );
  });

  test('User enter Vacancy Name with empty value on Add Vacancies', async ({ page }) => {
    await openAddVacancy(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(
      fieldByLabel(page, 'Vacancy Name').locator('.oxd-input-field-error-message'),
    ).toHaveText('Required');
  });

  test('User enter Job Tittle with empty value on Add Vacancies', async ({ page }) => {
    await openAddVacancy(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(fieldByLabel(page, 'Job Title').locator('.oxd-input-field-error-message')).toHaveText(
      'Required',
    );
  });

  test('User enter Hiring Manager with empty value on Add Vacancies', async ({ page }) => {
    await openAddVacancy(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(
      fieldByLabel(page, 'Hiring Manager').locator('.oxd-input-field-error-message'),
    ).toHaveText('Required');
  });

  test('User enter Hiring Manager with invalid value on Add Vacancies', async ({ page }) => {
    await openAddVacancy(page);
    await page.getByPlaceholder('Type for hints...').fill('123456778');
    await page.waitForTimeout(5000);
    await page.getByRole('heading', { name: 'Add Vacancy' }).click();
    await page.waitForTimeout(5000);

    await expect(
      fieldByLabel(page, 'Hiring Manager').locator('.oxd-input-field-error-message'),
    ).toHaveText('Invalid');
  });

  test('User enter Number of Positions with Alphanumeric value on Add Vacancies', async ({ page }) => {
    await openAddVacancy(page);
    await fieldByLabel(page, 'Number of Positions').locator('input').fill('%$#');
    await page.waitForTimeout(5000);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(5000);

    await expect(
      fieldByLabel(page, 'Number of Positions').locator('.oxd-input-field-error-message'),
    ).toHaveText('Should be a numeric value');
  });
});
