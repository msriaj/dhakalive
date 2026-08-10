import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

/**
 * Proves the R2 configuration actually works.
 *
 * Does a real round trip — head the bucket, write an object, read it back,
 * compare bytes, delete it — using exactly the settings the application uses.
 * A config that merely *looks* right is the failure mode this exists to catch:
 * a wrong endpoint or a token missing write scope only shows up on first upload.
 *
 * Also works against MinIO, which is how the storage path is exercised locally.
 *
 * Usage: pnpm --filter @dhakalive/web verify:r2
 */

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rootEnv = path.resolve(appDir, '../../.env')
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv)

const REQUIRED = [
  'CLOUDFLARE_R2_BUCKET',
  'CLOUDFLARE_R2_ENDPOINT',
  'CLOUDFLARE_R2_ACCESS_KEY_ID',
  'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
]

function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`PASS  ${message}`)
}

const missing = REQUIRED.filter((key) => !process.env[key]?.trim())
if (missing.length > 0) {
  console.error('Missing configuration:\n' + missing.map((key) => `  - ${key}`).join('\n'))
  console.error('\nSee docs/r2-storage.md for where each value comes from.')
  process.exit(1)
}

const bucket = process.env.CLOUDFLARE_R2_BUCKET
const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT

const client = new S3Client({
  endpoint,
  region: process.env.CLOUDFLARE_R2_REGION || 'auto',
  forcePathStyle: process.env.CLOUDFLARE_R2_FORCE_PATH_STYLE !== 'false',
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
})

// Timestamped so concurrent runs cannot collide, and prefixed so a stray object
// is obviously a test artefact.
const key = `_healthcheck/verify-${Date.now()}.txt`
const body = `dhakalive r2 verification ${new Date().toISOString()}`

console.log(`Bucket:   ${bucket}`)
console.log(`Endpoint: ${endpoint}`)
console.log('')

try {
  await client.send(new HeadBucketCommand({ Bucket: bucket }))
  pass('bucket reachable and credentials accepted')
} catch (error) {
  fail(`cannot reach bucket — ${error.name}: ${error.message}`)
  console.error('\nCheck the endpoint host and that the token is scoped to this bucket.')
  process.exit(1)
}

try {
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/plain' }),
  )
  pass('write succeeded (token has Object Write)')
} catch (error) {
  fail(`write refused — ${error.name}: ${error.message}`)
  console.error('\nThe R2 API token likely has read-only permissions.')
  process.exit(1)
}

try {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const roundTripped = await result.Body.transformToString()
  if (roundTripped === body) pass('read back byte-identical')
  else fail('read back different content than was written')
} catch (error) {
  fail(`read refused — ${error.name}: ${error.message}`)
}

// Public delivery is a separate concern from the S3 API: it depends on a custom
// domain being bound to the bucket, not on the credentials above.
const publicUrl = process.env.CLOUDFLARE_MEDIA_PUBLIC_URL?.trim()
if (!publicUrl) {
  console.log('SKIP  public delivery — CLOUDFLARE_MEDIA_PUBLIC_URL is not set')
} else {
  try {
    const response = await fetch(`${publicUrl.replace(/\/$/, '')}/${key}`)
    if (response.ok) pass(`public delivery works (${publicUrl})`)
    else fail(`public URL returned ${response.status} — is a custom domain bound to the bucket?`)
  } catch (error) {
    fail(`public URL unreachable — ${error.name}`)
  }
}

try {
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  pass('cleanup: test object deleted')
} catch (error) {
  console.error(`WARN  could not delete ${key} — ${error.name}. Remove it manually.`)
}
