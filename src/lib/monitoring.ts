import { redactLogMetadata, summarizeError } from '@/lib/logging/safe-log';

export const monitoring = {
  captureError(error: Error, context?: Record<string, unknown>) {
    const safeError = summarizeError(error);
    console.error(`[ERROR] ${safeError.message}`, {
      error: safeError,
      context: redactLogMetadata(context),
      timestamp: new Date().toISOString()
    });
  },
  addBreadcrumb(category: string, message: string, data?: Record<string, unknown>) {
    console.log(`[${category.toUpperCase()}] ${message}`, {
      data: redactLogMetadata(data),
      timestamp: new Date().toISOString()
    });
  },
  logSolana(message: string, data?: Record<string, unknown>) {
    console.log(`[SOLANA] ${message}`, {
      data: redactLogMetadata(data),
      timestamp: new Date().toISOString()
    });
  },
  logWallet(message: string, walletType: 'solana' | 'evm', data?: Record<string, unknown>) {
    console.log(`[WALLET-${walletType.toUpperCase()}] ${message}`, {
      data: redactLogMetadata(data),
      timestamp: new Date().toISOString()
    });
  }
};

export const { captureError } = monitoring;
