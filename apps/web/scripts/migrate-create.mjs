import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `payload migrate:create <name>`, then the import normaliser, then Prettier.
 *
 * A wrapper is needed because npm/pnpm append script arguments to the end of the
 * whole command string. Written as `payload migrate:create && normalize`, the
 * migration name would land on the normaliser instead of on Payload, and every
 * migration would be generated unnamed.
 *
 * The Prettier pass exists because Payload rewrites `migrations/index.ts` from a
 * template that does not match this repository's style, so `pnpm format:check`
 * fails on CI immediately after any migration is generated.
 */

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(appDir, '../..')
const args = process.argv.slice(2)

const run = (command, commandArgs) =>
  spawnSync(command, commandArgs, { cwd: appDir, stdio: 'inherit', shell: false })

const create = run('node', [
  `--env-file-if-exists=${path.join(repoRoot, '.env')}`,
  path.join(appDir, 'node_modules/payload/bin.js'),
  'migrate:create',
  ...args,
])

if (create.status !== 0) process.exit(create.status ?? 1)

const normalise = run('node', [path.join(appDir, 'scripts/normalize-migrations.mjs')])
if (normalise.status !== 0) process.exit(normalise.status ?? 1)

const format = run('npx', ['prettier', '--write', '--log-level', 'warn', 'src/migrations'])
process.exit(format.status ?? 0)
