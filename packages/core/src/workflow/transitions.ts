import { can, type AuthUser } from '../access/user.js'
import type { Capability } from '../access/capabilities.js'
import { isArticleStatus, type ArticleStatus } from './article-status.js'

/**
 * The article workflow as data.
 *
 * Every legal status change is one row in this table. A change that is not
 * listed is rejected — which means a crafted API request setting
 * `status: "published"` on a draft is a validation error rather than an
 * unnoticed state, and adding a workflow step is a table edit rather than a
 * hunt through hook code.
 */

export interface Transition {
  from: ArticleStatus
  to: ArticleStatus
  /** Capability the actor must hold. */
  capability: Capability
  /**
   * When true the actor must be the article's own author. Used for the
   * submit path so a contributor cannot submit somebody else's draft.
   */
  ownerOnly?: boolean
  /**
   * When true this transition is only performed by the background job runner.
   * Scheduled publication belongs to the worker, not to a request.
   */
  systemOnly?: boolean
  /** Shown in the admin UI as the button label. */
  label: string
}

const ARCHIVABLE: readonly ArticleStatus[] = [
  'draft',
  'submitted',
  'in-review',
  'changes-requested',
  'approved',
  'scheduled',
  'unpublished',
]

export const TRANSITIONS: readonly Transition[] = [
  // --- Authoring ------------------------------------------------------------
  {
    from: 'draft',
    to: 'submitted',
    capability: 'article:submit',
    ownerOnly: true,
    label: 'Submit for review',
  },
  {
    from: 'changes-requested',
    to: 'submitted',
    capability: 'article:submit',
    ownerOnly: true,
    label: 'Resubmit',
  },

  // --- Review ---------------------------------------------------------------
  { from: 'submitted', to: 'in-review', capability: 'article:review', label: 'Start review' },
  {
    from: 'in-review',
    to: 'changes-requested',
    capability: 'article:review',
    label: 'Request changes',
  },
  // An editor may bounce a submission back without formally claiming it first.
  {
    from: 'submitted',
    to: 'changes-requested',
    capability: 'article:review',
    label: 'Request changes',
  },
  { from: 'in-review', to: 'submitted', capability: 'article:review', label: 'Return to queue' },

  // --- Approval and publication --------------------------------------------
  { from: 'in-review', to: 'approved', capability: 'article:approve', label: 'Approve' },
  { from: 'approved', to: 'in-review', capability: 'article:approve', label: 'Reopen review' },
  { from: 'approved', to: 'scheduled', capability: 'article:schedule', label: 'Schedule' },
  { from: 'approved', to: 'published', capability: 'article:publish', label: 'Publish now' },
  { from: 'scheduled', to: 'approved', capability: 'article:schedule', label: 'Cancel schedule' },
  // A publisher may release a scheduled story early.
  { from: 'scheduled', to: 'published', capability: 'article:publish', label: 'Publish now' },
  // The same edge performed by the scheduled-publication job.
  {
    from: 'scheduled',
    to: 'published',
    capability: 'article:publish',
    systemOnly: true,
    label: 'Scheduled publication',
  },

  /**
   * Automated publication, taken by the ingest service and by nothing else.
   *
   * `systemOnly`, so it is unreachable from an HTTP body — the same protection
   * the scheduler's row has. It exists as its own edge rather than being walked
   * as draft → submitted → in-review → approved → published, because those four
   * transitions each mean something in the audit trail: "an editor reviewed
   * this" is a claim, and a machine taking that path would write it falsely.
   * One honest edge is better than four fictional ones.
   *
   * The publish guards still run, so an ingested story missing an image, a
   * category or alt text is refused and stays a draft for someone to look at.
   */
  {
    from: 'draft',
    to: 'published',
    capability: 'article:publish',
    systemOnly: true,
    label: 'Automated publication',
  },

  // --- Post-publication -----------------------------------------------------
  { from: 'published', to: 'unpublished', capability: 'article:unpublish', label: 'Unpublish' },
  { from: 'unpublished', to: 'published', capability: 'article:publish', label: 'Republish' },

  // --- Archiving ------------------------------------------------------------
  ...ARCHIVABLE.map((from): Transition => ({
    from,
    to: 'archived',
    capability: 'article:archive',
    label: 'Archive',
  })),
  // Restoring an archived story returns it to the start of the workflow rather
  // than to whatever status it held, so it cannot skip review on the way back.
  { from: 'archived', to: 'draft', capability: 'article:archive', label: 'Restore to draft' },
]

export interface TransitionContext {
  user: AuthUser | null | undefined
  /** Whether the actor is an author of the article. */
  isOwner?: boolean
  /** Set by the job runner for unattended transitions. */
  isSystem?: boolean
}

export type TransitionCheck = { ok: true; transition: Transition } | { ok: false; reason: string }

/** Every transition available out of a status, ignoring the actor. */
export function transitionsFrom(status: ArticleStatus): readonly Transition[] {
  return TRANSITIONS.filter((transition) => transition.from === status)
}

/** Transitions the given actor is actually allowed to perform right now. */
export function availableTransitions(
  status: ArticleStatus,
  context: TransitionContext,
): readonly Transition[] {
  return transitionsFrom(status).filter((transition) => checkTransitionRule(transition, context).ok)
}

function checkTransitionRule(transition: Transition, context: TransitionContext): TransitionCheck {
  if (transition.systemOnly && !context.isSystem) {
    return { ok: false, reason: 'This transition is performed by the scheduler, not by a user' }
  }

  // The job runner acts without a user and is trusted by construction; it is
  // only reachable from the worker process.
  if (context.isSystem && transition.systemOnly) return { ok: true, transition }

  if (!context.user) return { ok: false, reason: 'Authentication required' }

  if (!can(context.user, transition.capability)) {
    return { ok: false, reason: `You are not permitted to ${transition.label.toLowerCase()}` }
  }

  if (transition.ownerOnly && !context.isOwner && !can(context.user, 'article:update.any')) {
    return { ok: false, reason: 'Only an author of this article can do that' }
  }

  return { ok: true, transition }
}

/**
 * Validates a requested status change.
 *
 * Returns the matching transition so callers can record which edge was taken in
 * the workflow history — "approved by X" is more useful than "status changed".
 */
export function checkTransition(
  from: unknown,
  to: unknown,
  context: TransitionContext,
): TransitionCheck {
  if (!isArticleStatus(from))
    return { ok: false, reason: `Unknown current status: ${String(from)}` }
  if (!isArticleStatus(to)) return { ok: false, reason: `Unknown target status: ${String(to)}` }
  if (from === to) return { ok: false, reason: 'Status is unchanged' }

  const candidates = TRANSITIONS.filter(
    (transition) => transition.from === from && transition.to === to,
  )

  if (candidates.length === 0) {
    return { ok: false, reason: `Cannot move an article from "${from}" to "${to}"` }
  }

  // Several rows can describe the same edge — scheduled → published exists both
  // as a manual publish and as the scheduler's. Any satisfied row authorises it.
  let lastFailure: TransitionCheck = { ok: false, reason: 'Not permitted' }
  for (const candidate of candidates) {
    const result = checkTransitionRule(candidate, context)
    if (result.ok) return result
    lastFailure = result
  }

  return lastFailure
}
