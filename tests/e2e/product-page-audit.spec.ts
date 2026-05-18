import type { ConsoleMessage, Page, Request, Response } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { createIsolatedWorkspaceContext } from './helpers'

type PageAuditTarget = {
  label: string
  path: string
  requiredText?: RegExp[]
}

const FEATURE_RETAIL_FUNNEL = process.env.FEATURE_RETAIL_FUNNEL === 'true'

const PUBLIC_TARGETS: PageAuditTarget[] = [
  { label: 'home', path: '/', requiredText: [/Ship AI teams|autonomous agents|Dashboard|Mission Control/i] },
  { label: 'templates public gallery', path: '/templates', requiredText: [/Templates/i] },
  ...createPublicTemplateTargets([
    'personal-agent',
    'sales-assistant',
    'content-pipeline',
    'support-agent',
    'content-machine',
    'competitive-intel',
    'tier1-support',
    'churn-radar',
    'ceo-briefing',
    'brand-monitor',
    'contract-sentinel',
    'social-media-manager',
    'sales-outreach-lemlist',
    'marketing-campaign',
    'dev-monitor',
    'social-performance',
    'nps-pipeline',
    'ai-video-producer',
    'prospect-intelligence',
    'web3-whale-watchtower',
    'web3-token-war-room',
    'web3-prediction-market-alpha-desk',
    'web3-portfolio-risk-agent',
    'web3-smart-wallet-copy-desk',
    'web3-intelligence-suite',
  ]),
  ...(FEATURE_RETAIL_FUNNEL
    ? [{ label: 'agents preview landing', path: '/agents-preview', requiredText: [/agents|templates|pricing/i] }]
    : []),
  { label: 'pricing', path: '/pricing', requiredText: [/pricing/i] },
  { label: 'login', path: '/login', requiredText: [/sign in|login|Dashboard|Project ready|Open Agents canvas/i] },
]

const WORKSPACE_TARGETS: PageAuditTarget[] = [
  { label: 'workspace templates', path: '/{workspace}/templates', requiredText: [/Templates/i] },
  { label: 'mission control overview', path: '/{workspace}/mission-control', requiredText: [/Mission Control/i] },
  { label: 'mission control activity', path: '/{workspace}/mission-control/activity', requiredText: [/Activity|Mission Control/i] },
  { label: 'mission control agent ops', path: '/{workspace}/mission-control/agent-ops', requiredText: [/Agent Ops|Workflow|Mission Control/i] },
  { label: 'mission control browser', path: '/{workspace}/mission-control/browser', requiredText: [/Browser/i] },
  { label: 'mission control commerce', path: '/{workspace}/mission-control/commerce', requiredText: [/Commerce|Spend|Mission Control/i] },
  { label: 'mission control knowledge', path: '/{workspace}/mission-control/knowledge', requiredText: [/Knowledge|Memory|Mission Control/i] },
  { label: 'mission control system', path: '/{workspace}/mission-control/system', requiredText: [/System|Runtime|Mission Control/i] },
  { label: 'mission control templates', path: '/{workspace}/mission-control/templates', requiredText: [/Templates/i] },
  { label: 'knowledge', path: '/{workspace}/knowledge', requiredText: [/Knowledge|Memory/i] },
  { label: 'settings', path: '/{workspace}/settings', requiredText: [/Settings/i] },
]

const AUTHENTICATED_GLOBAL_TARGETS: PageAuditTarget[] = []

const PLACEHOLDER_COPY = new RegExp(
  String.raw`\b(lorem ipsum|mock data|fake data|placeholder data|${'to'}do: replace|coming soon placeholder)\b`,
  'i',
)

function createPublicTemplateTargets(ids: string[]): PageAuditTarget[] {
  return ids.map((id) => ({
    label: `template detail: ${id}`,
    path: `/templates/${id}`,
    requiredText: [/Template|Install|Preview/i],
  }))
}

test.describe('Product page audit', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('public pages load without console/page errors, mock copy, or inaccessible controls', async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    })
    const page = await context.newPage()
    const report = []

    try {
      for (const target of PUBLIC_TARGETS) {
        report.push(await auditPage(page, target))
      }
    } finally {
      await context.close()
    }

    await testInfo.attach('public-page-audit.json', {
      contentType: 'application/json',
      body: JSON.stringify(report, null, 2),
    })
  })

  test('authenticated core pages load with real workspace context and usable controls', async ({ page }, testInfo) => {
    const workspace = await createIsolatedWorkspaceContext(page)
    const report = []

    for (const target of AUTHENTICATED_GLOBAL_TARGETS) {
      report.push(await auditPage(page, target))
    }

    for (const target of WORKSPACE_TARGETS) {
      report.push(await auditPage(page, {
        ...target,
        path: target.path.replace('{workspace}', workspace.org.slug),
      }))
    }

    await testInfo.attach('workspace-page-audit.json', {
      contentType: 'application/json',
      body: JSON.stringify(report, null, 2),
    })
  })
})

async function auditPage(page: Page, target: PageAuditTarget) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const failedRequests: string[] = []
  const serverErrors: string[] = []

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  }
  const onPageError = (error: Error) => pageErrors.push(error.message)
  const onRequestFailed = (request: Request) => {
    if (['document', 'script', 'xhr', 'fetch'].includes(request.resourceType())) {
      failedRequests.push(`${request.resourceType()}: ${request.url()} ${request.failure()?.errorText ?? ''}`.trim())
    }
  }
  const onResponse = (response: Response) => {
    if (response.status() >= 500 && ['document', 'script', 'xhr', 'fetch'].includes(response.request().resourceType())) {
      serverErrors.push(`${response.status()}: ${response.request().resourceType()}: ${response.url()}`)
    }
  }

  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('requestfailed', onRequestFailed)
  page.on('response', onResponse)

  try {
    await page.goto(target.path, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined)

    for (const expected of target.requiredText ?? []) {
      await expect(page.getByText(expected).first(), `${target.label} should show ${expected}`).toBeVisible({ timeout: 30_000 })
    }
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined)
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined)
    await expect(page.locator('body'), `${target.label} body should be ready after redirects`).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500)

    await expect(page.locator('body')).not.toContainText(PLACEHOLDER_COPY)

    const unnamedControls = await page.locator('button, [role="button"], a').evaluateAll((elements) => (
      elements
        .filter((element) => {
          const style = window.getComputedStyle(element)
          const rect = element.getBoundingClientRect()
          const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
          const hiddenAncestor = element.closest('[hidden], [aria-hidden="true"], [inert], [data-radix-focus-guard]')
          return !hiddenAncestor && inViewport && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          aria: element.getAttribute('aria-label'),
          title: element.getAttribute('title'),
          text: element.textContent?.trim() ?? '',
          href: element instanceof HTMLAnchorElement ? element.getAttribute('href') : null,
          html: element.outerHTML.slice(0, 320),
        }))
        .filter((control) => {
          const hasName = Boolean(control.aria || control.title || control.text)
          const hasHref = control.tag !== 'a' || Boolean(control.href)
          return !hasName || !hasHref
        })
        .slice(0, 10)
    ))

    expect(unnamedControls, `${target.label} should not expose unnamed visible controls`).toEqual([])
    expect(consoleErrors.filter(isActionableBrowserError), `${target.label} console errors`).toEqual([])
    expect(pageErrors, `${target.label} page errors`).toEqual([])
    expect(failedRequests.filter(isActionableRequestFailure), `${target.label} failed critical requests`).toEqual([])
    expect(serverErrors, `${target.label} 5xx responses`).toEqual([])

    return {
      label: target.label,
      path: target.path,
      url: page.url(),
      consoleErrors,
      pageErrors,
      failedRequests,
      serverErrors,
      unnamedControls,
    }
  } finally {
    page.off('console', onConsole)
    page.off('pageerror', onPageError)
    page.off('requestfailed', onRequestFailed)
    page.off('response', onResponse)
  }
}

function isActionableBrowserError(message: string): boolean {
  return !/favicon|ResizeObserver loop|Failed to load resource: the server responded with a status of (404|429)|Cross-Origin-Opener-Policy: Failed to fetch/i.test(message)
}

function isActionableRequestFailure(message: string): boolean {
  return !/favicon|net::ERR_ABORTED/i.test(message)
}
