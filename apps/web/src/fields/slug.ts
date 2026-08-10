import { isValidSlug, slugify } from '@dhakalive/core'
import type { Field, FieldHook } from 'payload'

/**
 * Derives a slug from a source field when the editor has not set one.
 *
 * Runs on `beforeValidate` so the generated value is validated like any other,
 * and normalises whatever the editor typed rather than trusting it — a slug
 * pasted from a headline otherwise arrives with spaces and punctuation intact.
 */
function slugHook(sourceField: string): FieldHook {
  return ({ value, data, originalDoc }): unknown => {
    if (typeof value === 'string' && value.trim().length > 0) return slugify(value)

    // Fall back to the persisted value before regenerating, so renaming a
    // headline does not silently change the slug of an existing document.
    const existing: unknown = (originalDoc as Record<string, unknown> | undefined)?.slug
    if (typeof existing === 'string' && existing.length > 0) return existing

    const source: unknown = (data as Record<string, unknown> | undefined)?.[sourceField]
    return typeof source === 'string' ? slugify(source) : value
  }
}

export interface SlugFieldOptions {
  /** Field the slug is derived from when left blank. */
  sourceField?: string
  /** Localised slugs give each translation its own URL. */
  localized?: boolean
  required?: boolean
  description?: string
}

export function slugField(options: SlugFieldOptions = {}): Field {
  const {
    sourceField = 'title',
    localized = false,
    required = true,
    description = 'URL segment. Leave blank to generate it from the title. Bengali characters are preserved.',
  } = options

  return {
    name: 'slug',
    type: 'text',
    required,
    localized,
    unique: true,
    index: true,
    admin: {
      position: 'sidebar',
      description,
    },
    hooks: {
      beforeValidate: [slugHook(sourceField)],
    },
    validate: (value: unknown) => {
      if (value === null || value === undefined || value === '') {
        return required ? 'A slug is required' : true
      }
      if (typeof value !== 'string') return 'A slug must be text'
      if (!isValidSlug(value)) {
        return 'A slug may contain only lowercase letters, numbers, Bengali characters and single hyphens'
      }
      return true
    },
  }
}
