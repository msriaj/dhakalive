import pino, { type Logger, type LoggerOptions } from 'pino'
import { REDACT_PATHS, REDACTED } from './redact.js'

export type LogContext = Record<string, unknown>

export interface LoggerConfig {
  level: string
  /** `development` gets human-readable output; everything else emits JSON lines. */
  pretty: boolean
  service: string
  version?: string | undefined
  environment: string
}

function buildOptions(config: LoggerConfig): LoggerOptions {
  return {
    level: config.level,
    base: {
      service: config.service,
      env: config.environment,
      ...(config.version ? { version: config.version } : {}),
    },
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    formatters: {
      // Emit `level: "info"` rather than pino's default numeric level so log
      // aggregators can filter without a translation table.
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(config.pretty
      ? {
          transport: {
            target: 'pino/file',
            options: { destination: 1 },
          },
        }
      : {}),
  }
}

let rootLogger: Logger | undefined

export function createLogger(config: LoggerConfig): Logger {
  return pino(buildOptions(config))
}

export function initLogger(config: LoggerConfig): Logger {
  rootLogger = createLogger(config)
  return rootLogger
}

/**
 * Returns the process-wide logger, initialising a conservative default if the
 * host never called `initLogger`. Never throws — a logging failure must not be
 * the thing that takes down a request.
 */
export function getLogger(): Logger {
  rootLogger ??= createLogger({
    level: process.env.LOG_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV === 'development',
    service: 'dhakalive',
    environment: process.env.NODE_ENV ?? 'development',
    version: process.env.NEXT_PUBLIC_APP_VERSION,
  })
  return rootLogger
}

/** Child logger carrying a correlation id so one request's lines can be joined. */
export function withCorrelation(correlationId: string, context: LogContext = {}): Logger {
  return getLogger().child({ correlationId, ...context })
}

export type { Logger }
