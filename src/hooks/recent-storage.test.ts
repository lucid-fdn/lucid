import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRecentListStore } from '@/hooks/recent-storage'

describe('createRecentListStore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads normalized items from localStorage', () => {
    const getItem = vi.fn().mockReturnValue(JSON.stringify([{ id: 'a' }, { id: 1 }]))
    vi.stubGlobal('window', {} as Window & typeof globalThis)
    vi.stubGlobal('localStorage', {
      getItem,
      setItem: vi.fn(),
    })

    const store = createRecentListStore<{ id: string }>({
      storageKey: 'recent:test',
      normalize: (value) =>
        Array.isArray(value)
          ? value.filter((entry): entry is { id: string } => !!entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string')
          : [],
    })

    expect(store.getSnapshot()).toEqual([{ id: 'a' }])
    expect(store.readFromStorage()).toEqual([{ id: 'a' }])
    expect(getItem).toHaveBeenCalledWith('recent:test')
  })

  it('writes items and notifies subscribers', () => {
    const storage = new Map<string, string>()
    const setItem = vi.fn((key: string, value: string) => storage.set(key, value))
    const getItem = vi.fn((key: string) => storage.get(key) ?? null)
    vi.stubGlobal('window', {} as Window & typeof globalThis)
    vi.stubGlobal('localStorage', { getItem, setItem })

    const store = createRecentListStore<{ id: string }>({
      storageKey: 'recent:test',
      normalize: (value) =>
        Array.isArray(value)
          ? value.filter((entry): entry is { id: string } => !!entry && typeof entry === 'object' && typeof (entry as { id?: unknown }).id === 'string')
          : [],
    })
    const listener = vi.fn()
    const unsubscribe = store.subscribe(listener)

    store.setItems([{ id: 'agent-1' }])

    expect(setItem).toHaveBeenCalledWith('recent:test', JSON.stringify([{ id: 'agent-1' }]))
    expect(store.getSnapshot()).toEqual([{ id: 'agent-1' }])
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.setItems([{ id: 'agent-2' }])
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
