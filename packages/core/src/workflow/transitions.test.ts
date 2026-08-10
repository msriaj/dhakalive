import { describe, expect, it } from 'vitest'
import type { AuthUser, Role } from '../access/index.js'
import { ARTICLE_STATUSES, type ArticleStatus } from './article-status.js'
import {
  TRANSITIONS,
  availableTransitions,
  checkTransition,
  transitionsFrom,
} from './transitions.js'

function actor(...roles: Role[]): AuthUser {
  return { id: 1, roles }
}

const contributor = actor('contributor')
const reporter = actor('reporter')
const editor = actor('editor')
const publisher = actor('publisher')

const owner = { isOwner: true }
const stranger = { isOwner: false }

describe('transition table integrity', () => {
  it('only references known statuses', () => {
    for (const transition of TRANSITIONS) {
      expect(ARTICLE_STATUSES).toContain(transition.from)
      expect(ARTICLE_STATUSES).toContain(transition.to)
    }
  })

  it('never declares a self-transition', () => {
    expect(TRANSITIONS.filter((t) => t.from === t.to)).toEqual([])
  })

  it('leaves every status reachable from draft', () => {
    // A status nothing can reach is dead configuration.
    const reachable = new Set<ArticleStatus>(['draft'])
    let grew = true
    while (grew) {
      grew = false
      for (const transition of TRANSITIONS) {
        if (reachable.has(transition.from) && !reachable.has(transition.to)) {
          reachable.add(transition.to)
          grew = true
        }
      }
    }
    expect([...ARTICLE_STATUSES].filter((status) => !reachable.has(status))).toEqual([])
  })

  it('gives every status except archived a way out', () => {
    for (const status of ARTICLE_STATUSES) {
      if (status === 'archived') continue
      expect(transitionsFrom(status).length, `${status} is a dead end`).toBeGreaterThan(0)
    }
  })
})

describe('rejecting invalid edges', () => {
  it('refuses a jump straight from draft to published', () => {
    const result = checkTransition('draft', 'published', { user: publisher, ...owner })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('Cannot move') })
  })

  it('refuses draft to approved', () => {
    expect(checkTransition('draft', 'approved', { user: publisher }).ok).toBe(false)
  })

  it('refuses an unchanged status', () => {
    expect(checkTransition('draft', 'draft', { user: editor })).toMatchObject({
      ok: false,
      reason: 'Status is unchanged',
    })
  })

  it('refuses statuses that do not exist', () => {
    expect(checkTransition('draft', 'deleted', { user: publisher })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Unknown target status'),
    })
    expect(checkTransition('nonsense', 'draft', { user: publisher })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Unknown current status'),
    })
  })

  it('refuses anonymous actors', () => {
    expect(checkTransition('draft', 'submitted', { user: null, ...owner }).ok).toBe(false)
  })
})

describe('authoring', () => {
  it('lets a contributor submit their own draft', () => {
    expect(checkTransition('draft', 'submitted', { user: contributor, ...owner }).ok).toBe(true)
  })

  it("refuses a contributor submitting someone else's draft", () => {
    const result = checkTransition('draft', 'submitted', { user: contributor, ...stranger })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('author') })
  })

  it('lets an editor submit any draft, since they may edit any article', () => {
    expect(checkTransition('draft', 'submitted', { user: editor, ...stranger }).ok).toBe(true)
  })

  it('lets an author resubmit after changes are requested', () => {
    expect(checkTransition('changes-requested', 'submitted', { user: reporter, ...owner }).ok).toBe(
      true,
    )
  })
})

describe('review', () => {
  it('refuses a reporter starting a review', () => {
    expect(checkTransition('submitted', 'in-review', { user: reporter, ...owner }).ok).toBe(false)
  })

  it('lets an editor start a review and request changes', () => {
    expect(checkTransition('submitted', 'in-review', { user: editor }).ok).toBe(true)
    expect(checkTransition('in-review', 'changes-requested', { user: editor }).ok).toBe(true)
  })

  it('lets an editor bounce a submission back without claiming it', () => {
    expect(checkTransition('submitted', 'changes-requested', { user: editor }).ok).toBe(true)
  })

  it('refuses an editor approving', () => {
    const result = checkTransition('in-review', 'approved', { user: editor })
    expect(result).toMatchObject({ ok: false, reason: expect.stringContaining('not permitted') })
  })
})

describe('publication', () => {
  it.each([
    ['contributor', contributor],
    ['reporter', reporter],
    ['editor', editor],
  ])('refuses %s publishing an approved article', (_label, user) => {
    expect(checkTransition('approved', 'published', { user, ...owner }).ok).toBe(false)
  })

  it('lets a publisher approve, schedule and publish', () => {
    expect(checkTransition('in-review', 'approved', { user: publisher }).ok).toBe(true)
    expect(checkTransition('approved', 'scheduled', { user: publisher }).ok).toBe(true)
    expect(checkTransition('approved', 'published', { user: publisher }).ok).toBe(true)
  })

  it('lets a publisher unpublish and republish', () => {
    expect(checkTransition('published', 'unpublished', { user: publisher }).ok).toBe(true)
    expect(checkTransition('unpublished', 'published', { user: publisher }).ok).toBe(true)
  })

  it('refuses an editor unpublishing', () => {
    expect(checkTransition('published', 'unpublished', { user: editor }).ok).toBe(false)
  })
})

describe('scheduled publication', () => {
  it('lets the job runner publish a scheduled article without a user', () => {
    const result = checkTransition('scheduled', 'published', { user: null, isSystem: true })
    expect(result.ok).toBe(true)
    expect(result).toMatchObject({ transition: { systemOnly: true } })
  })

  it('still lets a publisher release a scheduled article early', () => {
    const result = checkTransition('scheduled', 'published', { user: publisher })
    expect(result.ok).toBe(true)
    // Matched against the manual edge, not the scheduler's.
    if (result.ok) expect(result.transition.systemOnly).toBeFalsy()
  })

  it('refuses an editor releasing a scheduled article', () => {
    expect(checkTransition('scheduled', 'published', { user: editor }).ok).toBe(false)
  })

  it('lets a publisher cancel a schedule', () => {
    expect(checkTransition('scheduled', 'approved', { user: publisher }).ok).toBe(true)
  })
})

describe('archiving', () => {
  it('lets an editor archive an unpublished article', () => {
    expect(checkTransition('draft', 'archived', { user: editor }).ok).toBe(true)
    expect(checkTransition('unpublished', 'archived', { user: editor }).ok).toBe(true)
  })

  it('refuses archiving a published article directly', () => {
    // It must be unpublished first, so the cache purge and search de-indexing
    // run through the normal unpublish path.
    expect(checkTransition('published', 'archived', { user: publisher })).toMatchObject({
      ok: false,
      reason: expect.stringContaining('Cannot move'),
    })
  })

  it('restores an archived article to draft rather than its old status', () => {
    expect(checkTransition('archived', 'draft', { user: editor }).ok).toBe(true)
    expect(checkTransition('archived', 'published', { user: publisher }).ok).toBe(false)
  })

  it('refuses a reporter archiving', () => {
    expect(checkTransition('draft', 'archived', { user: reporter, ...owner }).ok).toBe(false)
  })
})

describe('availableTransitions', () => {
  it('offers an owning contributor only the submit action from draft', () => {
    const available = availableTransitions('draft', { user: contributor, ...owner })
    expect(available.map((t) => t.to)).toEqual(['submitted'])
  })

  it('offers a contributor nothing on a stranger draft', () => {
    expect(availableTransitions('draft', { user: contributor, ...stranger })).toEqual([])
  })

  it('offers a publisher both publish and schedule from approved', () => {
    const available = availableTransitions('approved', { user: publisher })
    expect(new Set(available.map((t) => t.to))).toEqual(
      new Set(['scheduled', 'published', 'in-review', 'archived']),
    )
  })

  it('never offers a system-only transition to a user', () => {
    for (const status of ARTICLE_STATUSES) {
      const available = availableTransitions(status, { user: publisher })
      expect(available.some((t) => t.systemOnly)).toBe(false)
    }
  })
})
