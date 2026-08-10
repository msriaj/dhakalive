/**
 * `@dhakalive/core` holds the domain rules — capabilities, the article workflow
 * state machine, slugs, SEO defaults and revalidation targets.
 *
 * Hard constraint: this package imports neither Payload nor Next. That is what
 * keeps the rules unit-testable in isolation and what makes splitting the CMS,
 * the public site and the worker into separate services a packaging change
 * rather than a rewrite. Nothing framework-shaped belongs here.
 */
export { slugify, isValidSlug, uniqueSlug, MAX_SLUG_LENGTH } from './slug/slugify.js'
