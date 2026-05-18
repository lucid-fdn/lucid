import { expect, test } from '@playwright/test'

import { createIsolatedWorkspaceContext } from './helpers'

test.describe('Templates product UX', () => {
  test.describe.configure({ timeout: 4 * 60_000 })

  test('shows first utility, combination guidance, and Web3 detail proof', async ({ page }) => {
    const workspace = await createIsolatedWorkspaceContext(page)
    const analyticsRequests: string[] = []

    await page.route('**/api/templates/analytics**', async (route) => {
      analyticsRequests.push(route.request().postData() ?? '')
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    })

    await page.goto(`/${workspace.org.slug}/templates`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })

    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible()
    await expect(page.getByText('Best first utilities')).toBeVisible()
    await expect(page.getByText('Combine templates')).toBeVisible()
    await expect(page.getByText('Markets and wallets')).toBeVisible()
    await expect(page.getByText('Mission Control run', { exact: false }).first()).toBeVisible()

    const detailHref = `/${workspace.org.slug}/templates/web3-whale-watchtower`
    await expect(page.getByRole('link', { name: /Preview first utility/i })).toHaveAttribute('href', detailHref)
    await page.goto(detailHref, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })
    await expect(page).toHaveURL(new RegExp(`${detailHref}$`))
    await expect(page.getByRole('heading', { name: /Whale Watchtower/i })).toBeVisible()
    await expect(page.getByText('Know when important wallets move before the timeline catches up.')).toBeVisible()
    await expect(page.getByText('Example prompts and alerts')).toBeVisible()
    await expect(page.getByText('Mission Control proof')).toBeVisible()
    await expect(page.getByText('Combine templates')).toBeVisible()
    await page.getByText('Track these wallets', { exact: false }).click()
    await expect.poll(() => analyticsRequests.some((body) => body.includes('"source":"template_detail"'))).toBe(true)

    const [previewResponse] = await Promise.all([
      page.waitForResponse((response) => response.url().includes('/api/templates/capabilities/') && response.url().endsWith('/preview')),
      page.getByRole('button', { name: 'Preview install' }).click(),
    ])
    expect(previewResponse.ok()).toBe(true)
    await expect(page.getByRole('dialog', { name: /Whale Watchtower install preview/i })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Will create')).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: /Install/ }).click()
    await expect.poll(() => analyticsRequests.some((body) => body.includes('"event_type":"install"')), {
      timeout: 30_000,
    }).toBe(true)

    await page.goto(`/${workspace.org.slug}/templates`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })
    await expect(page.getByRole('heading', { name: 'Installed Capabilities' })).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('Activate Whale Watchtower')).toBeVisible()
    await expect(page.getByText('Add wallets')).toBeVisible()
    await expect(page.getByText('Choose alert channels')).toBeVisible()
    await expect(page.getByText('Run first brief')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mission Control proof' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Copy first prompt' }).last()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reconcile' }).first()).toBeVisible()

  })

  test('shows Mission Control template funnel analytics', async ({ page }) => {
    const workspace = await createIsolatedWorkspaceContext(page)

    await page.route('**/api/templates/analytics**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          summary: {
            orgId: workspace.org.id,
            projectId: null,
            since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
            generatedAt: new Date().toISOString(),
            totals: {
              gallery_view: 12,
              detail_view: 9,
              preview: 8,
              install: 5,
              reconcile: 1,
              first_run: 4,
              repeat_use: 2,
              combine_view: 3,
              combine_click: 1,
            },
            topTemplates: [{
              templateSlug: 'web3-whale-watchtower',
              templateName: 'Whale Watchtower',
              templateType: 'capability',
              backingKind: 'lucid_pack',
              events: {
                gallery_view: 4,
                detail_view: 3,
                preview: 4,
                install: 3,
                reconcile: 1,
                first_run: 2,
                repeat_use: 1,
                combine_view: 1,
                combine_click: 1,
              },
              conversion: {
                previewToInstall: 0.75,
                installToFirstRun: 0.667,
                firstRunToRepeatUse: 0.5,
              },
            }],
            dropOff: [
              { from: 'preview', to: 'install', fromCount: 8, toCount: 5, dropOffRate: 0.375 },
              { from: 'install', to: 'first_run', fromCount: 5, toCount: 4, dropOffRate: 0.2 },
              { from: 'first_run', to: 'repeat_use', fromCount: 4, toCount: 2, dropOffRate: 0.5 },
            ],
          },
        }),
      })
    })

    await page.goto(`/${workspace.org.slug}/mission-control/templates`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })

    await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible()
    await expect(page.getByText('Template conversion cockpit')).toBeVisible()
    await expect(page.getByText('Whale Watchtower')).toBeVisible()
    await expect(page.getByText('Preview -> install', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Install -> first run', { exact: true }).first()).toBeVisible()
  })
})
