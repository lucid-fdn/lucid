import { expect, test, type Page } from '@playwright/test'

import { getWorkspaceContext } from './helpers'

type ActionAuditTarget = {
  label: string
  path: string
}

type ActionControl = {
  index: number
  tag: string
  role: string | null
  text: string
  aria: string | null
  title: string | null
  href: string | null
  disabled: boolean
  html: string
}

const PUBLIC_TARGETS: ActionAuditTarget[] = [
  { label: 'home', path: '/' },
  { label: 'templates public gallery', path: '/templates' },
  { label: 'template detail whale watchtower', path: '/templates/web3-whale-watchtower' },
  { label: 'pricing', path: '/pricing' },
]

const WORKSPACE_TARGETS: ActionAuditTarget[] = [
  { label: 'workspace templates', path: '/{workspace}/templates' },
  { label: 'mission control overview', path: '/{workspace}/mission-control' },
  { label: 'mission control activity', path: '/{workspace}/mission-control/activity' },
  { label: 'mission control browser', path: '/{workspace}/mission-control/browser' },
  { label: 'mission control commerce', path: '/{workspace}/mission-control/commerce' },
  { label: 'mission control knowledge', path: '/{workspace}/mission-control/knowledge' },
  { label: 'mission control system', path: '/{workspace}/mission-control/system' },
  { label: 'mission control templates', path: '/{workspace}/mission-control/templates' },
  { label: 'knowledge manager', path: '/{workspace}/knowledge' },
  { label: 'settings', path: '/{workspace}/settings' },
]

const SAFE_CLICK_LABELS = [
  /^(overview|activity|runs|config|health|channels)$/i,
  /^(context|heartbeat|events|integrations|replay|system|templates)$/i,
  /^(copy first prompt|combine templates|preview|detail|review)$/i,
  /^(browser|commerce|knowledge|agent ops|workflow)$/i,
  /^(learn more|view docs|open|close|cancel|back)$/i,
]

const MUTATING_OR_RISKY_LABELS = /delete|remove|revoke|approve|reject|submit|buy|purchase|checkout|pay|deploy|install|connect|create|save|update|reconcile|mark connected|run|test|send|upload|import|publish/i

test.describe('UI action audit', () => {
  test.describe.configure({ timeout: 8 * 60_000 })

  test('public pages expose named controls and safe controls are clickable', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const report = []

    try {
      for (const target of PUBLIC_TARGETS) {
        const auditPage = await context.newPage()
        try {
          report.push(await auditActions(auditPage, target))
        } finally {
          await auditPage.close()
        }
      }
    } finally {
      await context.close()
    }

    await testInfo.attach('public-ui-action-audit.json', {
      contentType: 'application/json',
      body: JSON.stringify(report, null, 2),
    })
  })

  test('workspace pages expose named controls and safe controls are clickable', async ({ page }, testInfo) => {
    const workspace = await getWorkspaceContext(page)
    const report = []

    for (const target of WORKSPACE_TARGETS) {
      const auditPage = await page.context().newPage()
      try {
        report.push(await auditActions(auditPage, {
          ...target,
          path: target.path.replace('{workspace}', workspace.org.slug),
        }))
      } finally {
        await auditPage.close()
      }
    }

    await testInfo.attach('workspace-ui-action-audit.json', {
      contentType: 'application/json',
      body: JSON.stringify(report, null, 2),
    })
  })
})

async function auditActions(page: Page, target: ActionAuditTarget) {
  await page.goto(target.path, { waitUntil: 'domcontentloaded', timeout: 180_000 })
  await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => undefined)
  await expect(page.locator('body'), `${target.label} body should load`).toBeVisible({ timeout: 30_000 })

  const controls = await collectVisibleControls(page)
  const unnamed = controls.filter((control) => !control.text && !control.aria && !control.title)
  const anchorsWithoutHref = controls.filter((control) => control.tag === 'a' && !control.href)
  expect(unnamed, `${target.label} should not expose unnamed controls`).toEqual([])
  expect(anchorsWithoutHref, `${target.label} anchors should have hrefs`).toEqual([])

  const trialFailures: Array<{ control: ActionControl; error: string }> = []
  for (const control of controls.filter((item) => !item.disabled && shouldTrialClick(item)).slice(0, 80)) {
    const locator = page.locator(`[data-ui-action-audit-index="${control.index}"]`)
    await locator.click({ trial: true, timeout: 5_000 }).catch((error: unknown) => {
      trialFailures.push({
        control,
        error: error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error),
      })
    })
  }
  expect(trialFailures, `${target.label} visible controls should pass Playwright actionability`).toEqual([])

  const clicked: ActionControl[] = []
  const skipped: Array<ActionControl & { reason: string }> = []
  for (const control of controls.filter((item) => !item.disabled).slice(0, 40)) {
    const label = control.aria || control.text || control.title || control.href || ''
    if (!isSafeToClick(control, label)) {
      skipped.push({ ...control, reason: 'mutating, external, or unsupported audit click' })
      continue
    }

    const beforeUrl = page.url()
    await page.locator(`[data-ui-action-audit-index="${control.index}"]`).click({ timeout: 10_000 })
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined)
    await expect(page.locator('body'), `${target.label} should remain usable after clicking ${label}`).toBeVisible({ timeout: 10_000 })
    clicked.push(control)

    if (page.url() !== beforeUrl) {
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => page.goto(target.path, { waitUntil: 'domcontentloaded' }))
    }
  }

  return {
    label: target.label,
    path: target.path,
    url: page.url(),
    controlCount: controls.length,
    clicked: clicked.map(summarizeControl),
    skipped: skipped.map((control) => ({ ...summarizeControl(control), reason: control.reason })),
  }
}

async function collectVisibleControls(page: Page): Promise<ActionControl[]> {
  return page.locator('button, [role="button"], a, input[type="button"], input[type="submit"]').evaluateAll((elements) => {
    let index = 0
    return elements
      .filter((element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        const inViewport = rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth
        const hiddenAncestor = element.closest('[hidden], [aria-hidden="true"], [inert], [data-radix-focus-guard]')
        let pointerDisabledAncestor = false
        let current: Element | null = element
        while (current) {
          if (window.getComputedStyle(current).pointerEvents === 'none') {
            pointerDisabledAncestor = true
            break
          }
          current = current.parentElement
        }
        return !hiddenAncestor && !pointerDisabledAncestor && inViewport && style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      })
      .map((element) => {
        const currentIndex = index++
        element.setAttribute('data-ui-action-audit-index', String(currentIndex))
        const ariaDisabled = element.getAttribute('aria-disabled')
        return {
          index: currentIndex,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute('role'),
          text: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120) ?? '',
          aria: element.getAttribute('aria-label'),
          title: element.getAttribute('title'),
          href: element instanceof HTMLAnchorElement ? element.getAttribute('href') : null,
          disabled: element instanceof HTMLButtonElement || element instanceof HTMLInputElement
            ? element.disabled || ariaDisabled === 'true'
            : ariaDisabled === 'true',
          html: element.outerHTML.slice(0, 320),
        }
      })
  })
}

function isSafeToClick(control: ActionControl, label: string): boolean {
  if (control.href) return false
  if (MUTATING_OR_RISKY_LABELS.test(label)) return false
  return SAFE_CLICK_LABELS.some((pattern) => pattern.test(label.trim()))
}

function shouldTrialClick(control: ActionControl): boolean {
  return !control.href || !/^(https?:|mailto:|tel:)/i.test(control.href)
}

function summarizeControl(control: ActionControl) {
  return {
    index: control.index,
    tag: control.tag,
    label: control.aria || control.text || control.title || control.href,
    href: control.href,
  }
}
