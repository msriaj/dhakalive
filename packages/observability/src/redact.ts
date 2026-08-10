/**
 * Redaction paths handed to pino. This list is the enforcement point for
 * "never log passwords, tokens, cookies or full sensitive request payloads" —
 * anything added to a log context that matches is replaced before serialisation.
 *
 * pino applies these as literal paths, so each shape a secret can arrive in
 * needs its own entry; there is no recursive wildcard for arbitrary depth.
 */
export const REDACT_PATHS: readonly string[] = [
  'password',
  'passwordConfirm',
  'newPassword',
  'token',
  'apiKey',
  'secret',
  'authorization',
  'cookie',

  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.body.password',
  'req.body.token',

  'res.headers["set-cookie"]',

  'user.password',
  'user.salt',
  'user.hash',
  'user.resetPasswordToken',
  'user.apiKey',

  '*.password',
  '*.token',
  '*.secret',
  '*.apiKey',
]

export const REDACTED = '[redacted]'
