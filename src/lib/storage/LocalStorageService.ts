export class LocalStorageService {
  private static instance: LocalStorageService;
  private storage: Storage | null;
  private isServer: boolean;

  private constructor() {
    this.isServer = typeof window === 'undefined';
    if (!this.isServer) {
      this.storage = window.localStorage;
    } else {
      this.storage = null;
    }
  }

  static getInstance(): LocalStorageService {
    if (!LocalStorageService.instance) {
      LocalStorageService.instance = new LocalStorageService();
    }
    return LocalStorageService.instance;
  }

  get<T>(key: string): T | null {
    if (this.isServer || !this.storage) return null;
    try {
      const item = this.storage.getItem(key);
      if (!item) return null;
      return JSON.parse(item) as T;
    } catch (error) {
      console.error(`Error reading from localStorage: ${error}`);
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    if (this.isServer || !this.storage) return;
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing to localStorage: ${error}`);
    }
  }

  remove(key: string): void {
    if (this.isServer || !this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch (error) {
      console.error(`Error removing from localStorage: ${error}`);
    }
  }

  clear(): void {
    if (this.isServer || !this.storage) return;
    try {
      this.storage.clear();
    } catch (error) {
      console.error(`Error clearing localStorage: ${error}`);
    }
  }
}

export const localStorageService = LocalStorageService.getInstance();
