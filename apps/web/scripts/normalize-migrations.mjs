import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Rewrites Payload's generated migration imports to use `import type`.
 *
 * Payload 3.87 emits:
 *     import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
 *
 * `MigrateUpArgs` and `MigrateDownArgs` are types. Because they are only ever
 * used in type position, a type-stripping loader removes the annotations but
 * keeps the import binding — and Node then fails to link the module:
 *
 *     SyntaxError: The requested module '@payloadcms/db-postgres'
 *     does not provide an export named 'MigrateDownArgs'
 *
 * Node's native stripper, `--experimental-transform-types` and tsx all hit this,
 * because it is the erasable-syntax limitation rather than a loader bug. Marking
 * the import `type` is the fix, so `migrate:create` runs this immediately after
 * generating a migration.
 */

const TYPE_ONLY_EXPORTS = new Set(['MigrateUpArgs', 'MigrateDownArgs'])

const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../src/migrations',
)

const IMPORT_RE = /^import\s*\{([^}]*)\}\s*from\s*'(@payloadcms\/[^']+)'\s*$/m

async function normalise(filePath) {
  const original = await readFile(filePath, 'utf8')
  const match = IMPORT_RE.exec(original)
  if (!match) return false

  const [statement, rawNames, moduleSpecifier] = match
  const names = rawNames
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)

  // Already normalised, or nothing type-only to split out.
  if (!names.some((name) => TYPE_ONLY_EXPORTS.has(name))) return false

  const typeNames = names.filter((name) => TYPE_ONLY_EXPORTS.has(name))
  const valueNames = names.filter((name) => !TYPE_ONLY_EXPORTS.has(name))

  const lines = [`import type { ${typeNames.join(', ')} } from '${moduleSpecifier}'`]
  if (valueNames.length > 0) {
    lines.push(`import { ${valueNames.join(', ')} } from '${moduleSpecifier}'`)
  }

  await writeFile(filePath, original.replace(statement, lines.join('\n')), 'utf8')
  return true
}

const entries = await readdir(migrationsDir).catch(() => [])
const migrations = entries.filter((name) => name.endsWith('.ts') && name !== 'index.ts')

let changed = 0
for (const name of migrations) {
  if (await normalise(path.join(migrationsDir, name))) {
    changed += 1
    console.log(`normalised imports: ${name}`)
  }
}

if (changed === 0) console.log('migrations already normalised')
