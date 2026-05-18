import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/features', () => ({
  FEATURES: { retailFunnel: true },
}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: false, ready: true, user: null }),
}))

import RetailLandingPage from '../agents-preview/page'

describe('retail landing page', () => {
  it('renders a server component element wrapping hero + gallery', () => {
    const element = RetailLandingPage() as { type: string; props: { children: unknown } }
    expect(element).toBeDefined()
    expect(element.type).toBe('main')
    expect(Array.isArray(element.props.children)).toBe(true)
    const childTypes = (element.props.children as Array<{ type: { name?: string } }>).map(
      (c) => c.type?.name,
    )
    expect(childTypes).toContain('RetailHero')
    expect(childTypes).toContain('RetailTemplateGallery')
  })
})
