import { expect, test, type Request } from '@playwright/test'

test.describe('Agent avatar UI', () => {
  test('create-agent AI image customizer defaults to Lucid Studio 3D and posts avatar v2 payload', async ({ page }) => {
    let avatarRequestBody: Record<string, unknown> | null = null

    await page.route('**/api/agents/avatar/generate', async (route) => {
      const request: Request = route.request()
      avatarRequestBody = JSON.parse(request.postData() || '{}') as Record<string, unknown>

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'avatar-e2e-asset',
            url: '/placeholder.svg',
            provider: 'trustgate',
            model: 'gpt-image-2',
            metadata: {
              promptVersion: 'agent-avatar-v2',
              stylePreset: 'lucid-studio-3d',
              roleArchetype: 'general',
              colorPalette: 'violet-orbit',
            },
          },
        }),
      })
    })

    await page.goto('/agents/create', { waitUntil: 'domcontentloaded', timeout: 300_000 })

    await page.getByRole('button', { name: /Customize with AI/i }).click()
    await expect(page.getByRole('heading', { name: /AI Image Generation/i })).toBeVisible()

    const lucidStudio3D = page.getByRole('button', { name: 'Lucid Studio 3D' })
    await expect(lucidStudio3D).toBeVisible()
    await expect(lucidStudio3D).toHaveAttribute('data-slot', 'button')

    await expect(page.getByText('Keep same face on regeneration')).toBeVisible()
    await expect(page.getByText('3/4 Front')).toBeVisible()

    await page.getByPlaceholder('Describe the image you want to generate...').fill(
      'Premium friendly SaaS operator portrait with calm studio lighting.',
    )
    await page.getByRole('button', { name: /Generate Image/i }).click()

    await expect(page.getByAltText('Profile')).toBeVisible({ timeout: 30_000 })
    expect(avatarRequestBody).toMatchObject({
      name: 'Lucid Agent',
      stylePreset: 'lucid-studio-3d',
      expression: 'neutral-friendly',
      background: 'subtle-depth',
      angle: 'front-three-quarter',
      lockIdentity: false,
    })
  })
})
