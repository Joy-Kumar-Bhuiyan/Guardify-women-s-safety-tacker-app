import { expect, test } from '@playwright/test';

test('public tracking link shows consent state and acknowledgement', async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } })
  );
  await page.route('**/api/v1/public/track/test-token-abcdefghijklmnopqrstuvwxyz**', async (route) => {
    if (route.request().method() === 'POST') await route.fulfill({ json: { data: { acknowledged: true } } });
    else
      await route.fulfill({
        headers: { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' },
        json: {
          data: {
            purpose: 'Walk home',
            expiresAt: '2030-01-01T00:00:00.000Z',
            lastLocationAt: '2026-10-24T10:00:00.000Z',
            location: { latitude: 23.81, longitude: 90.41, accuracy: 20 }
          }
        }
      });
  });
  await page.goto('/track/test-token-abcdefghijklmnopqrstuvwxyz');
  await expect(page.getByRole('heading', { name: 'Guardify live safety share' })).toBeVisible();
  await expect(page.getByText('Walk home')).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge' }).click();
  await expect(page.getByText('The person sharing will know this link was opened.')).toBeVisible();
});

test('authenticated dashboard handles denied geolocation safely', async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ json: { data: { id: 'u1', email: 'u@example.test', name: 'User', role: 'user' } } })
  );
  await page.route('**/api/v1/contacts', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            name: 'Trusted',
            confirmedAt: '2026-10-24T00:00:00.000Z'
          }
        ]
      }
    })
  );
  await page.route('**/api/v1/shares', (route) => route.fulfill({ json: { data: [] } }));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'SOS' }).click();
  await expect(page.getByRole('alert')).toContainText('Call emergency services directly');
});

test('expired share link shows a neutral error without account information', async ({ page }) => {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } })
  );
  await page.route('**/api/v1/public/track/**', (route) =>
    route.fulfill({
      status: 410,
      json: { error: { code: 'SHARE_INACTIVE', message: 'This sharing link is inactive or expired' } }
    })
  );
  await page.goto('/track/expired-token-abcdefghijklmnopqrstuvwxyz');
  await expect(page.getByText('This link is inactive, expired, or revoked.')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('@');
});

test('contact invitation requires explicit opt-in and account logout clears the session', async ({
  page
}) => {
  const token = 'contact-opt-in-token-abcdefghijklmnopqrstuvwxyz';
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ json: { data: { id: 'u1', email: 'u@example.test', name: 'User', role: 'user' } } })
  );
  await page.route('**/api/v1/contacts', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        json: {
          data: {
            contact: {
              id: 'c1',
              name: 'Trusted',
              phone: '+8801700000000',
              email: null,
              channels: ['sms'],
              confirmedAt: null
            },
            optInLink: `http://127.0.0.1:4173/contact/confirm/${token}`
          }
        }
      });
    } else await route.fulfill({ json: { data: [] } });
  });
  await page.goto('/contacts');
  await page.getByLabel('Name').fill('Trusted');
  await page.getByLabel('Phone').fill('+8801700000000');
  await page.getByRole('textbox', { name: 'Email' }).fill('');
  await page.getByRole('checkbox', { name: 'Email' }).uncheck();
  await page.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByRole('link', { name: new RegExp(token) })).toBeVisible();

  await page.route(`**/api/v1/public/contacts/confirm/${token}`, (route) =>
    route.fulfill({ json: { data: { confirmed: true } } })
  );
  await page.goto(`/contact/confirm/${token}`);
  await expect(page.getByText('Receive Guardify alerts?')).toBeVisible();
  await page.getByRole('button', { name: 'I agree to receive alerts' }).click();
  await expect(page.getByText("You're confirmed")).toBeVisible();

  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
});
