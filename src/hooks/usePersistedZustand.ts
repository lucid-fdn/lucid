import create from 'zustand';
import { persist } from 'zustand/middleware';
import { localStorageService } from '@/lib/storage/LocalStorageService';
import { performanceMonitor } from '@/lib/monitoring/performance';

interface ZustandStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

interface PersistedZustandOptions<T> {
  name: string;
  initialState: T;
  storage?: ZustandStorage;
  partialize?: (state: T) => Partial<T>;
  onRehydrateStorage?: (state: T | null) => void;
}

/**
 * Custom hook for creating persisted Zustand stores with TypeScript support
 * 
 * Usage:
 * ```tsx
 * interface UserStore {
 *   preferences: Record<string, any>;
 *   settings: Record<string, any>;
 *   setPreferences: (prefs: Record<string, any>) => void;
 *   setSettings: (settings: Record<string, any>) => void;
 *   reset: () => void;
 * }
 * 
 * const useUserStore = usePersistedZustand<UserStore>({
 *   name: 'user-store',
 *   initialState: {
 *     preferences: {},
 *     settings: {},
 *     setPreferences: (prefs) => set({ preferences: prefs }),
 *     setSettings: (settings) => set({ settings }),
 *     reset: () => set({ preferences: {}, settings: {} }),
 *   },
 * });
 * ```
 */
export function usePersistedZustand<T extends object>({
  name,
  initialState,
  storage = {
    getItem: (key: string): string | null => {
      performanceMonitor.startMetric('zustandStorageGet');
      const value = localStorageService.get<string>(key);
      performanceMonitor.endMetric('zustandStorageGet', { key, hasValue: !!value });
      return value;
    },
    setItem: (key: string, value: string): void => {
      performanceMonitor.startMetric('zustandStorageSet');
      localStorageService.set(key, value);
      performanceMonitor.endMetric('zustandStorageSet', { 
        key, 
        valueSize: value.length 
      });
    },
    removeItem: (key: string): void => {
      performanceMonitor.startMetric('zustandStorageRemove');
      localStorageService.remove(key);
      performanceMonitor.endMetric('zustandStorageRemove', { key });
    },
  },
  partialize,
  onRehydrateStorage,
}: PersistedZustandOptions<T>) {
  type StoreType = T & { setState: (newState: Partial<T>) => void; reset: () => void };
  return create<StoreType>(
    (persist as any)(
      (set: (fn: StoreType | Partial<StoreType> | ((state: StoreType) => StoreType | Partial<StoreType>)) => void) => ({
        ...initialState,
        setState: (newState: Partial<T>) => set((state: StoreType) => ({ ...state, ...newState })),
        reset: () => set(initialState as unknown as StoreType),
      } as StoreType),
      {
        name,
        storage,
        partialize: partialize as ((state: StoreType) => Partial<StoreType>) | undefined,
        onRehydrateStorage,
      }
    )
  );
}

/**
 * Hook for creating a non-persisted Zustand store
 * 
 * Usage:
 * ```tsx
 * interface UIStore {
 *   isDarkMode: boolean;
 *   toggleDarkMode: () => void;
 * }
 * 
 * const useUIStore = useZustand<UIStore>({
 *   initialState: {
 *     isDarkMode: false,
 *     toggleDarkMode: () => set((state) => ({ isDarkMode: !state.isDarkMode })),
 *   },
 * });
 * ```
 */
export function useZustand<T extends object>({
  initialState,
}: Omit<PersistedZustandOptions<T>, 'name' | 'storage' | 'partialize' | 'onRehydrateStorage'>) {
  type StoreType = T & { setState: (newState: Partial<T>) => void; reset: () => void };
  return create<StoreType>((set: (fn: StoreType | Partial<StoreType> | ((state: StoreType) => StoreType | Partial<StoreType>)) => void) => ({
    ...initialState,
    setState: (newState: Partial<T>) => set((state: StoreType) => ({ ...state, ...newState })),
    reset: () => set(initialState as unknown as StoreType),
  } as StoreType));
}
