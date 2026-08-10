import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { rawDb, type ActingUser } from './payload'

/**
 * Minimal editorial fixtures — one category, one author, one image with alt
 * text. Enough for an article to satisfy the publish guards.
 */

/** Smallest valid PNG: a single transparent pixel. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

export function lexicalBody(text: string) {
  return {
    root: {
      type: 'root',
      format: '' as const,
      indent: 0,
      version: 1,
      direction: 'ltr' as const,
      children: [
        {
          type: 'paragraph',
          format: '' as const,
          indent: 0,
          version: 1,
          direction: 'ltr' as const,
          children: [
            { type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 },
          ],
        },
      ],
    },
  }
}

export interface EditorialFixtures {
  // Postgres ids are numeric; Payload's generated relationship types require it.
  categoryId: number
  authorId: number
  imageId: number
  imageWithoutAltId: number
}

export async function seedEditorialFixtures(
  payload: Payload,
  actor: ActingUser,
): Promise<EditorialFixtures> {
  const category = await payload.create({
    collection: 'categories',
    data: { title: 'রাজনীতি', slug: 'politics' },
    user: actor,
    overrideAccess: false,
  })

  const author = await payload.create({
    collection: 'authors',
    data: { displayName: 'Rafiq Reporter', slug: 'rafiq-reporter' },
    user: actor,
    overrideAccess: false,
  })

  const image = await payload.create({
    collection: 'media',
    data: { alt: 'A single pixel used as a test image' },
    file: {
      data: ONE_PIXEL_PNG,
      mimetype: 'image/png',
      name: 'pixel.png',
      size: ONE_PIXEL_PNG.byteLength,
    },
    user: actor,
    overrideAccess: false,
  })

  // Field validation refuses to save an image without alt text, so this row is
  // emptied with raw SQL. That is exactly the state legacy rows and bulk
  // imports arrive in, and the case the publish guard exists to catch.
  const bare = await payload.create({
    collection: 'media',
    data: { alt: 'temporary' },
    file: {
      data: ONE_PIXEL_PNG,
      mimetype: 'image/png',
      name: 'pixel-no-alt.png',
      size: ONE_PIXEL_PNG.byteLength,
    },
    overrideAccess: true,
  })
  await rawDb(payload).execute(
    sql`UPDATE media_locales SET alt = NULL WHERE _parent_id = ${bare.id}`,
  )

  return {
    categoryId: category.id,
    authorId: author.id,
    imageId: image.id,
    imageWithoutAltId: bare.id,
  }
}

export { ONE_PIXEL_PNG }
