import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import { ONE_PIXEL_PNG } from '../helpers/fixtures'
import {
  createUserAs,
  expectRejection,
  getOrCreateSuperAdmin,
  getTestPayload,
  type ActingUser,
  type SeededUser,
} from '../helpers/payload'

/**
 * Upload validation.
 *
 * The point of these is that a rejected upload is rejected by the *server*, not
 * by an accept attribute in the admin UI — every case here goes through the
 * Local API with access control on, the same path a direct API call takes.
 */

let payload: Payload
let superAdmin: ActingUser
let reporter: SeededUser
let contributor: SeededUser

function file(name: string, mimetype: string, data: Buffer = ONE_PIXEL_PNG) {
  return { data, mimetype, name, size: data.byteLength }
}

/** Relationships come back populated at the default depth. */
function relationshipId(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id
    if (typeof id === 'string' || typeof id === 'number') return String(id)
  }
  return null
}

beforeAll(async () => {
  payload = await getTestPayload()
  superAdmin = await getOrCreateSuperAdmin(payload)

  reporter = await createUserAs(payload, superAdmin, {
    email: 'media-reporter@dhakalive.test',
    name: 'Media Reporter',
    roles: ['reporter'],
  })
  contributor = await createUserAs(payload, superAdmin, {
    email: 'media-contributor@dhakalive.test',
    name: 'Media Contributor',
    roles: ['contributor'],
  })
})

describe('MIME type allowlist', () => {
  it.each([
    ['text/html', 'payload.html'],
    ['image/svg+xml', 'payload.svg'],
    ['application/javascript', 'payload.js'],
    ['application/x-msdownload', 'payload.exe'],
  ])('rejects %s', async (mimetype, name) => {
    const message = await expectRejection(
      payload.create({
        collection: 'media',
        data: { alt: 'Should never be stored' },
        file: file(name, mimetype),
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it('accepts an allowed image type', async () => {
    const created = await payload.create({
      collection: 'media',
      data: { alt: 'An allowed PNG' },
      file: file('allowed.png', 'image/png'),
      user: reporter.doc,
      overrideAccess: false,
    })
    expect(created.mimeType).toBe('image/png')
  })
})

describe('size limit', () => {
  it('rejects a file over the 50 MB limit', async () => {
    // Declared size is what the guard reads, so this needs no real 51 MB buffer.
    const oversized = {
      data: ONE_PIXEL_PNG,
      mimetype: 'image/png',
      name: 'huge.png',
      size: 51 * 1024 * 1024,
    }

    const message = await expectRejection(
      payload.create({
        collection: 'media',
        data: { alt: 'Too large' },
        file: oversized,
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('larger than')
  })
})

describe('alt text', () => {
  it('refuses an image without alt text', async () => {
    const message = await expectRejection(
      payload.create({
        collection: 'media',
        data: {},
        file: file('no-alt.png', 'image/png'),
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it('refuses whitespace-only alt text', async () => {
    const message = await expectRejection(
      payload.create({
        collection: 'media',
        data: { alt: '   ' },
        file: file('blank-alt.png', 'image/png'),
        user: reporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })
})

describe('derived metadata', () => {
  it('records the uploader and classifies the media type', async () => {
    const created = await payload.create({
      collection: 'media',
      data: { alt: 'Provenance check' },
      file: file('provenance.png', 'image/png'),
      user: contributor.doc,
      overrideAccess: false,
    })

    expect(created.mediaType).toBe('image')
    expect(relationshipId(created.uploadedBy)).toBe(String(contributor.doc.id))
  })

  it('generates responsive sizes and keeps the original dimensions', async () => {
    const created = await payload.create({
      collection: 'media',
      data: { alt: 'Sizes check' },
      file: file('sizes.png', 'image/png'),
      user: reporter.doc,
      overrideAccess: false,
    })

    expect(created.width).toBe(1)
    expect(created.height).toBe(1)
    expect(created.sizes).toBeDefined()
  })

  it('refuses to let an uploader rewrite provenance', async () => {
    const created = await payload.create({
      collection: 'media',
      data: { alt: 'Provenance is not editable' },
      file: file('immutable.png', 'image/png'),
      user: contributor.doc,
      overrideAccess: false,
    })

    const updated = await payload.update({
      collection: 'media',
      id: created.id,
      data: { uploadedBy: reporter.doc.id as number },
      user: contributor.doc,
      overrideAccess: false,
    })

    // The field is stripped rather than honoured — uploadedBy is a record.
    expect(relationshipId(updated.uploadedBy)).toBe(String(contributor.doc.id))
  })
})

describe('upload permissions', () => {
  it('refuses an anonymous upload', async () => {
    const message = await expectRejection(
      payload.create({
        collection: 'media',
        data: { alt: 'Anonymous' },
        file: file('anon.png', 'image/png'),
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })

  it("refuses a contributor editing another user's asset", async () => {
    const other = await payload.create({
      collection: 'media',
      data: { alt: 'Belongs to the reporter' },
      file: file('reporter-owned.png', 'image/png'),
      user: reporter.doc,
      overrideAccess: false,
    })

    const message = await expectRejection(
      payload.update({
        collection: 'media',
        id: other.id,
        data: { credit: 'Stolen credit' },
        user: contributor.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()
  })
})
