import { test, expect } from '@playwright/test';

// Jeda 5 detik setelah tiap test case, biar demo publik ini tidak diserbu
// request beruntun (sempat melambat drastis sampai test timeout).
test.afterEach(async ({ page }) => {
  await page.waitForTimeout(5_000);
});


const LOGIN_URL = 'https://opensource-demo.orangehrmlive.com/web/index.php/auth/login';

test.describe('OrangeHRM - Halaman Login', { tag: '@positive' }, () => {
  test('user dapat mengakses halaman login', async ({ page }) => {
    const response = await page.goto(LOGIN_URL);
    await page.waitForTimeout(5000);

    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(LOGIN_URL);
    await expect(page).toHaveTitle(/OrangeHRM/i);
  });

  // test('form login tampil di halaman', async ({ page }) => {
  //   await page.goto(LOGIN_URL);

  //   await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();
  //   await expect(page.getByPlaceholder('Username')).toBeVisible();
  //   await expect(page.getByPlaceholder('Password')).toBeVisible();
  //   await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  // });

  test('User Login with valid Credential', async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.waitForTimeout(5000);

    await page.locator('input[name="username"]').fill('Admin');
    await page.waitForTimeout(5000);
    await page.locator('input[name="password"]').fill('admin123');
    await page.waitForTimeout(5000);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);

    await expect(page).toHaveURL(/\/dashboard\/index/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('.oxd-userdropdown-name')).toBeVisible();
  });
});

test.describe('Fitur Negatif case Login', { tag: '@negative' }, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.waitForTimeout(5000);
  });

  test('Login with use wrong username', async ({ page }) => {
    await page.locator('input[name="username"]').fill('123');
    await page.waitForTimeout(5000);
    await page.locator('input[name="password"]').fill('admin123');
    await page.waitForTimeout(5000);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);

    await expect(page.locator('.oxd-alert-content-text')).toHaveText('Invalid credentials', {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('Login with use wrong password', async ({ page }) => {
    await page.locator('input[name="username"]').fill('admin');
    await page.waitForTimeout(5000);
    await page.locator('input[name="password"]').fill('admin1233');
    await page.waitForTimeout(5000);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);

    await expect(page.locator('.oxd-alert-content-text')).toHaveText('Invalid credentials', {
      timeout: 30_000,
    });
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('Users are looking for features that are not on the menu', async ({ page }) => {
    await page.locator('input[name="username"]').fill('Admin');
    await page.waitForTimeout(5000);
    await page.locator('input[name="password"]').fill('admin123');
    await page.waitForTimeout(5000);
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);
    await expect(page).toHaveURL(/\/dashboard\/index/, { timeout: 30_000 });

    // Ketik nama fitur yang tidak ada di menu
    await page.getByPlaceholder('Search').fill('Pajak');
    await page.waitForTimeout(5000);

    // Sidebar jadi kosong — tidak ada menu yang cocok
    await expect(page.locator('.oxd-main-menu-item')).toHaveCount(0);
  });

  test('Login with empty username and password', async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await page.waitForTimeout(5000);

    // Form tidak dikirim sama sekali — validasi berhenti di sisi client
    await expect(page.locator('.oxd-input-field-error-message')).toHaveText(['Required', 'Required']);
    await expect(page).toHaveURL(LOGIN_URL);
  });
});
