/**
 * Authentication Audit Logging
 * Structured logging for auth events (success/fail, refresh, logout)
 */

export enum AuthEvent {
  LOGIN_SUCCESS = 'auth.login.success',
  LOGIN_FAILURE = 'auth.login.failure',
  LOGOUT = 'auth.logout',
  REFRESH_SUCCESS = 'auth.refresh.success',
  REFRESH_FAILURE = 'auth.refresh.failure',
  TOKEN_EXPIRED = 'auth.token.expired',
  CSRF_VIOLATION = 'auth.csrf.violation',
  RATE_LIMIT_HIT = 'auth.ratelimit.hit',
}

export interface AuthAuditLog {
  event: AuthEvent;
  timestamp: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

/**
 * Logs an authentication event with structured data
 */
export function logAuthEvent(
  event: AuthEvent,
  data: Omit<AuthAuditLog, 'event' | 'timestamp'>
): void {
  const log: AuthAuditLog = {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Log to console (structured format)
  const logLevel = event.includes('failure') || event.includes('violation') ? 'warn' : 'info';
  
  if (logLevel === 'warn') {
    console.warn('[AUTH-AUDIT]', JSON.stringify(log, null, 2));
  } else {
    console.log('[AUTH-AUDIT]', JSON.stringify(log, null, 2));
  }

  // TODO: Send to structured logging service (DataDog, LogRocket, etc.)
  // Example: sendToLogService(log);
}

/**
 * Helper to extract IP from request
 */
export function getClientIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  return 'unknown';
}

/**
 * Helper to get user agent
 */
export function getUserAgent(req: Request): string {
  return req.headers.get('user-agent') || 'unknown';
}

/**
 * Pre-built logging functions for common events
 */
export const AuthAudit = {
  loginSuccess: (userId: string, ip: string, userAgent: string) => {
    logAuthEvent(AuthEvent.LOGIN_SUCCESS, {
      userId,
      ip,
      userAgent,
      metadata: { method: 'privy' },
    });
  },

  loginFailure: (ip: string, userAgent: string, error: string) => {
    logAuthEvent(AuthEvent.LOGIN_FAILURE, {
      ip,
      userAgent,
      error,
    });
  },

  logout: (userId: string, ip: string) => {
    logAuthEvent(AuthEvent.LOGOUT, {
      userId,
      ip,
    });
  },

  refreshSuccess: (userId: string, ip: string) => {
    logAuthEvent(AuthEvent.REFRESH_SUCCESS, {
      userId,
      ip,
    });
  },

  refreshFailure: (ip: string, error: string) => {
    logAuthEvent(AuthEvent.REFRESH_FAILURE, {
      ip,
      error,
    });
  },

  csrfViolation: (ip: string, userAgent: string, path: string) => {
    logAuthEvent(AuthEvent.CSRF_VIOLATION, {
      ip,
      userAgent,
      metadata: { path },
    });
  },

  rateLimitHit: (ip: string, endpoint: string) => {
    logAuthEvent(AuthEvent.RATE_LIMIT_HIT, {
      ip,
      metadata: { endpoint },
    });
  },
};
