import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * `payload migrate:create <name>` followed by the import normaliser.
 *
 * A wrapper is needed because npm/pnpm append script arguments to the end of the
 * whole command string. Written as `payload migrate:create && normalize`, the
 * migration name would land on the normaliser instead of on Payload, and every
 * migration would be generated unnamed.
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
process.exit(normalise.status ?? 0)
