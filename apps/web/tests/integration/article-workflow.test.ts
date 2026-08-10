import { beforeAll, describe, expect, it } from 'vitest'
import type { Payload } from 'payload'

import type { Article } from '../../src/payload-types'

type WorkflowStatus = NonNullable<Article['workflowStatus']>

import { lexicalBody, seedEditorialFixtures, type EditorialFixtures } from '../helpers/fixtures'
import {
  createUserAs,
  expectRejection,
  getOrCreateSuperAdmin,
  getTestPayload,
  type ActingUser,
  type SeededUser,
} from '../helpers/payload'

/**
 * The editorial workflow as Payload actually applies it.
 *
 * The transition table is unit-tested in `@dhakalive/core`; this suite proves
 * the collection is wired to it, that the query constraints filter rows in SQL,
 * and that the publish guards run against real relationships.
 */

let payload: Payload
let superAdmin: ActingUser
let fixtures: EditorialFixtures
let reporter: SeededUser
let otherReporter: SeededUser
let editor: SeededUser
let publisher: SeededUser

/** A draft that satisfies every publish guard except the workflow itself. */
async function createCompleteDraft(actor: ActingUser, headline: string): Promise<Article> {
  return payload.create({
    collection: 'articles',
    data: {
      headline,
      slug: '',
      body: lexicalBody('The full text of the story.'),
      authors: [fixtures.authorId],
      primaryCategory: fixtures.categoryId,
      featuredImage: fixtures.imageId,
      articleType: 'standard',
      workflowStatus: 'draft',
    },
    user: actor,
    overrideAccess: false,
  })
}

async function setStatus(id: number, status: WorkflowStatus, actor: ActingUser): Promise<Article> {
  return payload.update({
    collection: 'articles',
    id,
    data: { workflowStatus: status },
    user: actor,
    overrideAccess: false,
  })
}

/** Walks an article all the way to approved using the correct actor per step. */
async function advanceToApproved(id: number, author: ActingUser): Promise<void> {
  await setStatus(id, 'submitted', author)
  await setStatus(id, 'in-review', editor.doc)
  await setStatus(id, 'approved', publisher.doc)
}

beforeAll(async () => {
  payload = await getTestPayload()
  superAdmin = await getOrCreateSuperAdmin(payload)
  fixtures = await seedEditorialFixtures(payload, superAdmin)

  reporter = await createUserAs(payload, superAdmin, {
    email: 'wf-reporter@dhakalive.test',
    name: 'Workflow Reporter',
    roles: ['reporter'],
  })
  otherReporter = await createUserAs(payload, superAdmin, {
    email: 'wf-reporter2@dhakalive.test',
    name: 'Other Reporter',
    roles: ['reporter'],
  })
  editor = await createUserAs(payload, superAdmin, {
    email: 'wf-editor@dhakalive.test',
    name: 'Workflow Editor',
    roles: ['editor'],
  })
  publisher = await createUserAs(payload, superAdmin, {
    email: 'wf-publisher@dhakalive.test',
    name: 'Workflow Publisher',
    roles: ['publisher'],
  })
})

describe('creating drafts', () => {
  it('lets a reporter create a draft', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Reporter draft')
    expect(article.workflowStatus).toBe('draft')
    expect(article.createdBy).toBeTruthy()
  })

  it('forces a new article to start as a draft whatever the request asks for', async () => {
    const message = await expectRejection(
      payload.create({
        collection: 'articles',
        data: {
          headline: 'Straight to published',
          slug: '',
          body: lexicalBody('Text.'),
          authors: [fixtures.authorId],
          primaryCategory: fixtures.categoryId,
          featuredImage: fixtures.imageId,
          articleType: 'standard',
          workflowStatus: 'published',
        },
        user: publisher.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('must start as a draft')
  })
})

describe('ownership', () => {
  it("refuses a reporter editing another reporter's draft", async () => {
    const article = await createCompleteDraft(reporter.doc, 'Private draft')

    const message = await expectRejection(
      payload.update({
        collection: 'articles',
        id: article.id,
        data: { headline: 'Hijacked' },
        user: otherReporter.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toBeTruthy()

    const after = await payload.findByID({
      collection: 'articles',
      id: article.id,
      overrideAccess: true,
    })
    expect(after.headline).toBe('Private draft')
  })

  it("hides another reporter's draft from list queries", async () => {
    await createCompleteDraft(reporter.doc, 'Hidden from peers')

    const visible = await payload.find({
      collection: 'articles',
      user: otherReporter.doc,
      overrideAccess: false,
      limit: 100,
    })
    expect(visible.docs.some((doc) => doc.headline === 'Hidden from peers')).toBe(false)
  })

  it('lets an editor read any draft', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Editor can see this')
    const found = await payload.findByID({
      collection: 'articles',
      id: article.id,
      user: editor.doc,
      overrideAccess: false,
    })
    expect(found.headline).toBe('Editor can see this')
  })

  it("refuses a reporter submitting another reporter's draft", async () => {
    const article = await createCompleteDraft(reporter.doc, 'Not yours to submit')
    const message = await expectRejection(setStatus(article.id, 'submitted', otherReporter.doc))
    expect(message).toBeTruthy()
  })
})

describe('review', () => {
  it('lets a reporter submit their own draft', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Submit me')
    const submitted = await setStatus(article.id, 'submitted', reporter.doc)
    expect(submitted.workflowStatus).toBe('submitted')
  })

  it('refuses a reporter starting a review', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Self review attempt')
    await setStatus(article.id, 'submitted', reporter.doc)

    const message = await expectRejection(setStatus(article.id, 'in-review', reporter.doc))
    expect(message).toBeTruthy()
  })

  it('lets an editor request changes, and the author resubmit', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Needs work')
    await setStatus(article.id, 'submitted', reporter.doc)
    await setStatus(article.id, 'in-review', editor.doc)

    const bounced = await payload.update({
      collection: 'articles',
      id: article.id,
      data: { workflowStatus: 'changes-requested', workflowNote: 'Second source needed' },
      user: editor.doc,
      overrideAccess: false,
    })
    expect(bounced.workflowStatus).toBe('changes-requested')

    const resubmitted = await setStatus(article.id, 'submitted', reporter.doc)
    expect(resubmitted.workflowStatus).toBe('submitted')
  })

  it('refuses an editor approving', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Editor approval attempt')
    await setStatus(article.id, 'submitted', reporter.doc)
    await setStatus(article.id, 'in-review', editor.doc)

    const message = await expectRejection(setStatus(article.id, 'approved', editor.doc))
    expect(message).toBeTruthy()
  })
})

describe('publication', () => {
  it('refuses a reporter publishing', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Reporter publish attempt')
    await advanceToApproved(article.id, reporter.doc)

    const message = await expectRejection(setStatus(article.id, 'published', reporter.doc))
    expect(message).toBeTruthy()

    const after = await payload.findByID({
      collection: 'articles',
      id: article.id,
      overrideAccess: true,
    })
    expect(after.workflowStatus).toBe('approved')
  })

  it('refuses a jump straight from draft to published', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Skip the queue')
    const message = await expectRejection(setStatus(article.id, 'published', publisher.doc))
    expect(message).toContain('Cannot move')
  })

  it('lets a publisher publish an approved article and stamps publishedAt', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Ready to run')
    await advanceToApproved(article.id, reporter.doc)

    const published = await setStatus(article.id, 'published', publisher.doc)
    expect(published.workflowStatus).toBe('published')
    expect(published.publishedAt).toBeTruthy()
    expect(published._status).toBe('published')
  })

  it('records every transition with its actor', async () => {
    const article = await createCompleteDraft(reporter.doc, 'History check')
    await advanceToApproved(article.id, reporter.doc)
    const published = await setStatus(article.id, 'published', publisher.doc)

    const history = published.workflowHistory ?? []
    expect(history.map((entry) => `${entry.from}->${entry.to}`)).toEqual([
      'draft->submitted',
      'submitted->in-review',
      'in-review->approved',
      'approved->published',
    ])
    expect(history.every((entry) => entry.actor !== null)).toBe(true)
  })

  it('keeps the original publication date when republishing', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Republish me')
    await advanceToApproved(article.id, reporter.doc)
    const published = await setStatus(article.id, 'published', publisher.doc)
    const firstPublishedAt = published.publishedAt

    await setStatus(article.id, 'unpublished', publisher.doc)
    const republished = await setStatus(article.id, 'published', publisher.doc)

    expect(republished.publishedAt).toBe(firstPublishedAt)
  })
})

describe('publish guards', () => {
  async function approvedArticleMissing(
    field: 'authors' | 'primaryCategory' | 'featuredImage',
  ): Promise<number> {
    const article = await payload.create({
      collection: 'articles',
      data: {
        headline: `Incomplete ${field}`,
        slug: '',
        body: lexicalBody('Text.'),
        authors: field === 'authors' ? [] : [fixtures.authorId],
        primaryCategory: field === 'primaryCategory' ? null : fixtures.categoryId,
        featuredImage: field === 'featuredImage' ? null : fixtures.imageId,
        articleType: 'standard',
        workflowStatus: 'draft',
      },
      user: reporter.doc,
      overrideAccess: false,
    })
    await setStatus(article.id, 'submitted', reporter.doc)
    await setStatus(article.id, 'in-review', editor.doc)
    await setStatus(article.id, 'approved', publisher.doc)
    return article.id
  }

  it.each(['authors', 'primaryCategory', 'featuredImage'] as const)(
    'refuses publication without %s',
    async (field) => {
      const id = await approvedArticleMissing(field)
      const message = await expectRejection(setStatus(id, 'published', publisher.doc))
      expect(message).toContain('Cannot publish')
      expect(message).toContain(field)
    },
  )

  it('refuses publication when the featured image has no alt text', async () => {
    const article = await payload.create({
      collection: 'articles',
      data: {
        headline: 'Image without alt',
        slug: '',
        body: lexicalBody('Text.'),
        authors: [fixtures.authorId],
        primaryCategory: fixtures.categoryId,
        featuredImage: fixtures.imageWithoutAltId,
        articleType: 'standard',
        workflowStatus: 'draft',
      },
      user: reporter.doc,
      overrideAccess: false,
    })
    await advanceToApproved(article.id, reporter.doc)

    const message = await expectRejection(setStatus(article.id, 'published', publisher.doc))
    expect(message).toContain('alt text')
  })

  it('refuses an empty body', async () => {
    const article = await payload.create({
      collection: 'articles',
      data: {
        headline: 'No body',
        slug: '',
        authors: [fixtures.authorId],
        primaryCategory: fixtures.categoryId,
        featuredImage: fixtures.imageId,
        articleType: 'standard',
        workflowStatus: 'draft',
      },
      user: reporter.doc,
      overrideAccess: false,
    })
    await advanceToApproved(article.id, reporter.doc)

    const message = await expectRejection(setStatus(article.id, 'published', publisher.doc))
    expect(message).toContain('body')
  })

  it('refuses scheduling without a future date', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Schedule with no date')
    await advanceToApproved(article.id, reporter.doc)

    const message = await expectRejection(setStatus(article.id, 'scheduled', publisher.doc))
    expect(message).toContain('date')
  })

  it('refuses scheduling in the past', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Schedule in the past')
    await advanceToApproved(article.id, reporter.doc)

    const message = await expectRejection(
      payload.update({
        collection: 'articles',
        id: article.id,
        data: {
          workflowStatus: 'scheduled',
          scheduledAt: new Date(Date.now() - 60_000).toISOString(),
        },
        user: publisher.doc,
        overrideAccess: false,
      }),
    )
    expect(message).toContain('future')
  })

  it('accepts a future schedule', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Properly scheduled')
    await advanceToApproved(article.id, reporter.doc)

    const scheduled = await payload.update({
      collection: 'articles',
      id: article.id,
      data: {
        workflowStatus: 'scheduled',
        scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      user: publisher.doc,
      overrideAccess: false,
    })
    expect(scheduled.workflowStatus).toBe('scheduled')
  })
})

describe('public visibility', () => {
  it('returns only published articles to an anonymous reader', async () => {
    const draft = await createCompleteDraft(reporter.doc, 'Anonymous should not see this')
    const live = await createCompleteDraft(reporter.doc, 'Anonymous should see this')
    await advanceToApproved(live.id, reporter.doc)
    await setStatus(live.id, 'published', publisher.doc)

    const publicResults = await payload.find({
      collection: 'articles',
      overrideAccess: false,
      limit: 200,
    })

    const headlines = publicResults.docs.map((doc) => doc.headline)
    expect(headlines).toContain('Anonymous should see this')
    expect(headlines).not.toContain('Anonymous should not see this')
    expect(publicResults.docs.every((doc) => doc.workflowStatus === 'published')).toBe(true)

    const direct = await expectRejection(
      payload.findByID({ collection: 'articles', id: draft.id, overrideAccess: false }),
    )
    expect(direct).toBeTruthy()
  })

  it('removes an unpublished article from public results', async () => {
    const article = await createCompleteDraft(reporter.doc, 'Will be pulled')
    await advanceToApproved(article.id, reporter.doc)
    await setStatus(article.id, 'published', publisher.doc)
    await setStatus(article.id, 'unpublished', publisher.doc)

    const publicResults = await payload.find({
      collection: 'articles',
      overrideAccess: false,
      limit: 200,
    })
    expect(publicResults.docs.map((doc) => doc.headline)).not.toContain('Will be pulled')
  })
})
