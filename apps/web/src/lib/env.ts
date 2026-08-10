import { getServerEnv, type ServerEnv } from '@dhakalive/config'

/**
 * Validated server environment for anything running inside the Next app.
 *
 * Deliberately does no filesystem work: reading `.env` from here would make
 * Turbopack trace the whole repository into the standalone output. Loading the
 * env file is the entry point's job instead —
 *   - Next            : `next.config.ts` loads the root `.env` before compiling
 *   - Payload CLI     : `node --env-file-if-exists=../../.env` in package.json
 *   - Worker          : same flag in its start script
 * In containers and CI the real process environment is already populated and
 * none of those steps apply.
 */
export function env(): ServerEnv {
  return getServerEnv()
}
