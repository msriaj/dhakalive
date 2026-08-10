/**
 * Publication readiness checks.
 *
 * Pure and framework-free so the same rules run in the Payload hook, in the
 * scheduled-publication job, and in tests. Returns every problem at once and
 * maps each to a field, so the editor sees "featured image needs alt text"
 * against the right input rather than a generic failure.
 */

export interface FieldIssue {
  field: string
  message: string
}

/** A featured image resolved far enough to inspect its alt text. */
export interface ResolvedMedia {
  id?: unknown
  alt?: unknown
}

export interface PublishCandidate {
  headline?: unknown
  body?: unknown
  authors?: unknown
  primaryCategory?: unknown
  language?: unknown
  slug?: unknown
  /**
   * Must be resolved (depth >= 1) before validating. A bare relationship id
   * carries no alt text, and the alt-text rule is the whole point of the check.
   */
  featuredImage?: ResolvedMedia | null
}

export type PublishValidation = { ok: true } | { ok: false; issues: FieldIssue[] }

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Walks a Lexical editor state looking for any real text.
 *
 * An "empty" rich text field is not null — it is a root node with one empty
 * paragraph, which a truthiness check would happily accept as a filled body.
 */
export function hasRichTextContent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  const root = (value as { root?: unknown }).root
  if (!root || typeof root !== 'object') return false

  const visit = (node: unknown): boolean => {
    if (!node || typeof node !== 'object') return false
    const candidate = node as { type?: unknown; text?: unknown; children?: unknown }

    if (isNonEmptyString(candidate.text)) return true

    // Media, embeds and horizontal rules carry no text but are real content.
    if (
      typeof candidate.type === 'string' &&
      ['upload', 'relationship', 'block', 'horizontalrule'].includes(candidate.type)
    ) {
      return true
    }

    if (Array.isArray(candidate.children)) return candidate.children.some(visit)
    return false
  }

  return visit(root)
}

function hasAtLeastOneRelationship(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== undefined && value !== ''
}

export interface PublishGuardOptions {
  /**
   * Article types that carry no featured image. A live blog leads with its
   * updates, so requiring a hero image would block legitimate publication.
   */
  requireFeaturedImage?: boolean
}

export function validatePublishable(
  candidate: PublishCandidate,
  options: PublishGuardOptions = {},
): PublishValidation {
  const { requireFeaturedImage = true } = options
  const issues: FieldIssue[] = []

  if (!isNonEmptyString(candidate.headline)) {
    issues.push({ field: 'headline', message: 'A headline is required before publishing' })
  }

  if (!isNonEmptyString(candidate.slug)) {
    issues.push({ field: 'slug', message: 'A slug is required before publishing' })
  }

  if (!hasRichTextContent(candidate.body)) {
    issues.push({ field: 'body', message: 'The article body cannot be empty' })
  }

  if (!hasAtLeastOneRelationship(candidate.authors)) {
    issues.push({ field: 'authors', message: 'At least one author is required' })
  }

  if (!hasAtLeastOneRelationship(candidate.primaryCategory)) {
    issues.push({ field: 'primaryCategory', message: 'A primary category is required' })
  }

  if (!isNonEmptyString(candidate.language)) {
    issues.push({ field: 'language', message: 'A content language is required' })
  }

  if (requireFeaturedImage) {
    const image = candidate.featuredImage
    const imageId = image?.id
    if (imageId === null || imageId === undefined || imageId === '') {
      issues.push({ field: 'featuredImage', message: 'A featured image is required' })
    } else if (!isNonEmptyString(image?.alt)) {
      // Accessibility requirement, and the reason the image must be resolved.
      issues.push({
        field: 'featuredImage',
        message: 'The featured image needs alt text before it can be used',
      })
    }
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues }
}

/** Formats issues into a single human-readable sentence for an API error. */
export function describeIssues(issues: readonly FieldIssue[]): string {
  return issues.map((issue) => `${issue.field}: ${issue.message}`).join('; ')
}
