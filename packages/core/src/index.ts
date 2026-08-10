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

export {
  ROLES,
  ROLE_RANK,
  isRole,
  toRoles,
  CAPABILITIES,
  capabilitiesForRole,
  capabilitiesForRoles,
  roleHasCapability,
  can,
  canAll,
  canAny,
  canAssignRole,
  canManageUser,
  capabilitiesOf,
  effectiveRank,
  isSameUser,
  isSuperAdmin,
  rolesOf,
  validateRoleAssignment,
} from './access/index.js'
export type { Role, Capability, AuthUser, RoleAssignmentResult } from './access/index.js'

export {
  ARTICLE_STATUSES,
  ARTICLE_TYPES,
  PUBLIC_STATUSES,
  AUTHOR_EDITABLE_STATUSES,
  PRE_PUBLICATION_STATUSES,
  isArticleStatus,
  isArticleType,
  isPubliclyVisible,
  TRANSITIONS,
  availableTransitions,
  checkTransition,
  transitionsFrom,
  describeIssues,
  hasRichTextContent,
  validatePublishable,
} from './workflow/index.js'
export type {
  ArticleStatus,
  ArticleType,
  Transition,
  TransitionContext,
  TransitionCheck,
  FieldIssue,
  PublishCandidate,
  PublishGuardOptions,
  PublishValidation,
  ResolvedMedia,
} from './workflow/index.js'

export {
  CacheTag,
  allLocaleHomes,
  computeRevalidationTargets,
  mergeTargets,
  parseRevalidationEvent,
} from './cache/index.js'
export type { ArticleChange, RevalidationEvent, RevalidationTargets } from './cache/index.js'

export { richTextToPlainText } from './rich-text/plain-text.js'
export type { PlainTextOptions } from './rich-text/plain-text.js'

export {
  SCHEMA_CONTEXT,
  breadcrumbSchema,
  collectionPageSchema,
  graph,
  newsArticleSchema,
  organizationId,
  organizationSchema,
  personSchema,
  webSiteId,
  webSiteSchema,
} from './seo/json-ld.js'
export type {
  BreadcrumbItem,
  CollectionPageInput,
  ImageInput,
  JsonLdNode,
  NewsArticleInput,
  OrganizationInput,
  PersonInput,
  WebSiteInput,
} from './seo/json-ld.js'
