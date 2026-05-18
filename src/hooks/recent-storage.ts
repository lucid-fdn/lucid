'use client'

export interface RecentListStore<T> {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => T[]
  getServerSnapshot: () => T[]
  setItems: (items: T[]) => void
  readFromStorage: () => T[]
}

interface CreateRecentListStoreOptions<T> {
  storageKey: string
  normalize: (value: unknown) => T[]
}

const EMPTY_LIST: [] = []

export function createRecentListStore<T>({
  storageKey,
  normalize,
}: CreateRecentListStoreOptions<T>): RecentListStore<T> {
  let listeners: Array<() => void> = []
  let cachedSnapshot: T[] = EMPTY_LIST

  function readFromStorage(): T[] {
    if (typeof window === 'undefined') return EMPTY_LIST

    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? normalize(JSON.parse(raw)) : EMPTY_LIST
    } catch {
      return EMPTY_LIST
    }
  }

  function subscribe(listener: () => void) {
    listeners = [...listeners, listener]
    return () => {
      listeners = listeners.filter((entry) => entry !== listener)
    }
  }

  function emitChange() {
    cachedSnapshot = readFromStorage()
    for (const listener of listeners) listener()
  }

  function setItems(items: T[]) {
    if (typeof window === 'undefined') return
    localStorage.setItem(storageKey, JSON.stringify(items))
    emitChange()
  }

  function getSnapshot() {
    return cachedSnapshot
  }

  function getServerSnapshot(): T[] {
    return EMPTY_LIST
  }

  if (typeof window !== 'undefined') {
    cachedSnapshot = readFromStorage()
  }

  return {
    subscribe,
    getSnapshot,
    getServerSnapshot,
    setItems,
    readFromStorage,
  }
}
