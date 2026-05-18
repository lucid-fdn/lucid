// src/hooks/useLocalStorageEffect.ts
import { useEffect } from 'react';
import { localStorageService } from '@/lib/storage/LocalStorageService';
import { performanceMonitor } from '@/lib/monitoring/performance';

export function useLocalStorageEffect<T>(key: string, state: T) {
  useEffect(() => {
    performanceMonitor.startMetric('localStorageEffect');
    localStorageService.set(key, state);
    performanceMonitor.endMetric('localStorageEffect', {
      key,
      stateSize: JSON.stringify(state).length
    });
  }, [key, state]);
}
