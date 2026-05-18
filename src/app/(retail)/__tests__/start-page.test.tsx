import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({ authenticated: false, ready: true, user: null }),
}))

vi.mock('@/lib/features', () => ({
  FEATURES: { retailFunnel: true },
}))

const { getUserIdMock, notFoundMock, redirectMock } = vi.hoisted(() => ({
  getUserIdMock: vi.fn(),
  notFoundMock: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))

vi.mock('@/lib/auth/server-utils', () => ({
  getUserId: getUserIdMock,
}))

vi.mock('next/navigation', () => ({
  notFound: notFoundMock,
  redirect: redirectMock,
}))

import RetailStartPage from '../agents-preview/start/[slug]/page'

describe('retail start page', () => {
  it('calls notFound for unknown slugs', async () => {
    getUserIdMock.mockResolvedValue('user-1')
    await expect(
      RetailStartPage({ params: Promise.resolve({ slug: 'does-not-exist' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('redirects unauthenticated users to /login', async () => {
    getUserIdMock.mockResolvedValue(null)
    await expect(
      RetailStartPage({ params: Promise.resolve({ slug: 'personal-research-assistant' }) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
  })

  it('renders the wizard for an authenticated user with a valid slug', async () => {
    getUserIdMock.mockResolvedValue('user-2')
    const element = (await RetailStartPage({
      params: Promise.resolve({ slug: 'customer-support-agent' }),
    })) as { type: string; props: { children: { type: { name?: string } } } }
    expect(element.type).toBe('main')
    expect(element.props.children.type?.name).toBe('StartWizard')
  })
})
