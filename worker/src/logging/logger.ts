/**
 * Logger — Structured JSON logging with Pino.
 * 
 * Production-ready logging with:
 * - JSON output for log aggregation (Datadog, CloudWatch, etc.)
 * - Request IDs for tracing
 * - Contextual metadata
 * - Log levels (trace, debug, info, warn, error, fatal)
 * 
 * Install: npm install pino pino-pretty
 * 
 * Usage:
 * ```typescript
 * import { logger } from './logging/logger'
 * 
 * logger.info({ userId: '123', action: 'login' }, 'User logged in')
 * logger.error({ err, userId: '123' }, 'Failed to send message')
 * ```
 */

// Conditional import - only use pino if installed
let pino: any = null
let pinoPretty: any = null

try {
  pino = require('pino')
  try {
    pinoPretty = require('pino-pretty')
  } catch {
    // pino-pretty optional (dev only)
  }
} catch {
  console.warn('[logger] Pino not installed - falling back to console logging')
}

interface LogContext {
  [key: string]: any
}

class Logger {
  private pinoInstance: any
  private isDevelopment: boolean

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production'

    if (pino) {
      // Create Pino instance
      this.pinoInstance = pino({
        level: process.env.LOG_LEVEL || (this.isDevelopment ? 'debug' : 'info'),
        
        // Pretty print in development
        ...(this.isDevelopment && pinoPretty
          ? {
              transport: {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  translateTime: 'SYS:standard',
                  ignore: 'pid,hostname',
                },
              },
            }
          : {}),
        
        // Base metadata
        base: {
          environment: process.env.NODE_ENV || 'development',
          service: 'lucid-personal-worker',
        },
      })
    }
  }

  /**
   * Create a child logger with additional context.
   * Useful for request-scoped logging.
   */
  child(context: LogContext): Logger {
    if (this.pinoInstance) {
      const childLogger = new Logger()
      childLogger.pinoInstance = this.pinoInstance.child(context)
      childLogger.isDevelopment = this.isDevelopment
      return childLogger
    }
    return this
  }

  /**
   * Log at trace level (very detailed)
   */
  trace(context: LogContext | string, message?: string | LogContext): void {
    this.log('trace', context, message)
  }

  /**
   * Log at debug level (detailed)
   */
  debug(context: LogContext | string, message?: string | LogContext): void {
    this.log('debug', context, message)
  }

  /**
   * Log at info level (general information)
   */
  info(context: LogContext | string, message?: string | LogContext): void {
    this.log('info', context, message)
  }

  /**
   * Log at warn level (warnings)
   */
  warn(context: LogContext | string, message?: string | LogContext): void {
    this.log('warn', context, message)
  }

  /**
   * Log at error level (errors)
   */
  error(context: LogContext | string, message?: string | LogContext): void {
    this.log('error', context, message)
  }

  /**
   * Log at fatal level (critical errors)
   */
  fatal(context: LogContext | string, message?: string | LogContext): void {
    this.log('fatal', context, message)
  }

  /**
   * Internal log method
   * Supports both: logger.info({ context }, 'message') and logger.info('message', { context })
   */
  private log(level: string, context: LogContext | string, message?: string | LogContext): void {
    // Handle flexible argument patterns:
    // 1. logger.info('message') - just message
    // 2. logger.info({ context }, 'message') - Pino style
    // 3. logger.info('message', { context }) - alternate style
    if (typeof context === 'string' && typeof message === 'object') {
      // logger.info('message', { context }) → swap
      const temp = context
      context = message as LogContext
      message = temp
    } else if (typeof context === 'string') {
      // logger.info('message') → context becomes empty
      message = context
      context = {}
    }

    // Pino logging
    if (this.pinoInstance) {
      ;(this.pinoInstance as any)[level](context, message)
      return
    }

    // Fallback to console
    const timestamp = new Date().toISOString()
    const logData = { timestamp, level, ...context, message }
    
    switch (level) {
      case 'trace':
      case 'debug':
        console.debug(JSON.stringify(logData))
        break
      case 'info':
        console.log(JSON.stringify(logData))
        break
      case 'warn':
        console.warn(JSON.stringify(logData))
        break
      case 'error':
      case 'fatal':
        console.error(JSON.stringify(logData))
        break
    }
  }

  /**
   * Flush logs (important for serverless environments)
   */
  async flush(): Promise<void> {
    if (this.pinoInstance && typeof this.pinoInstance.flush === 'function') {
      await new Promise<void>((resolve) => {
        this.pinoInstance.flush(() => resolve())
      })
    }
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger()

/**
 * Create a request-scoped logger with tracing context
 */
export function createRequestLogger(context: {
  requestId?: string
  userId?: string
  assistantId?: string
  conversationId?: string
  channel?: string
}): Logger {
  return logger.child({
    ...context,
    requestId: context.requestId || generateRequestId(),
  })
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Log error with stack trace
 */
export function logError(
  error: Error | unknown,
  context: LogContext = {}
): void {
  if (error instanceof Error) {
    logger.error({
      ...context,
      err: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    }, error.message)
  } else {
    logger.error({
      ...context,
      error: String(error),
    }, 'Unknown error')
  }
}

/**
 * Timing decorator - logs execution time
 */
export function timed(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const start = Date.now()
    try {
      const result = await originalMethod.apply(this, args)
      const duration = Date.now() - start
      
      logger.debug({
        method: propertyKey,
        duration,
      }, `${propertyKey} completed in ${duration}ms`)
      
      return result
    } catch (error) {
      const duration = Date.now() - start
      
      logger.error({
        method: propertyKey,
        duration,
        error: error instanceof Error ? error.message : String(error),
      }, `${propertyKey} failed after ${duration}ms`)
      
      throw error
    }
  }

  return descriptor
}