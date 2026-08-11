import {
  ARTICLE_TYPES,
  INGEST_BLOCK_TYPES,
  validateBlocks,
  type IngestBlock,
} from '@dhakalive/core'
import OpenAI from 'openai'

import type { ArticleDetail } from './source.js'

/**
 * Turns a scraped article into the fields our content model wants.
 *
 * The model is asked for a typed object, not prose. Prose would have to be
 * parsed back into structure by guesswork — a line beginning with a dash might
 * be a list item or a sentence about a dash — and that guess would be made on
 * the wrong side of the boundary. A JSON schema moves the decision to the model,
 * which knows the answer, and makes a malformed generation a rejected write
 * rather than a paragraph containing the word "pullQuote".
 */

/**
 * `live-blog` is excluded on purpose. It is the one article type the publish
 * guards exempt from the featured-image requirement, so leaving it selectable
 * would let a generation route itself around a rule the newsroom relies on.
 */
const SELECTABLE_TYPES = ARTICLE_TYPES.filter((type) => type !== 'live-blog')

/** Matches the `summary` field's own `maxLength`, so a long one fails here first. */
const MAX_SUMMARY = 400

/**
 * `divider` is offered to editors but never to the generator.
 *
 * Measured across two models and every sample run, a divider came back in the
 * body every single time — usually mid-article, between two ordinary
 * paragraphs. That is not the model getting it wrong so much as the vocabulary
 * offering a block with no editorial trigger: there is nothing in a wire report
 * that a horizontal rule is the right answer to. The type stays supported for
 * hand-written stories; it is simply not on the menu here.
 */
const GENERATED_BLOCK_TYPES = INGEST_BLOCK_TYPES.filter((type) => type !== 'divider')

/**
 * A generation that never returns holds the whole pass.
 *
 * Nothing bounded this before, and the SDK's own default is generous enough
 * that two stories in one sample took over ten minutes each while the rest took
 * under a minute. With a per-pass cap of a few stories, that is the difference
 * between a sweep taking minutes and taking most of an hour. A story that
 * exceeds this is not lost — it fails, and the next pass picks it up again.
 */
const REQUEST_TIMEOUT_MS = 180_000

export interface RewriteResult {
  headline: string
  subheadline: string | null
  summary: string
  articleType: string
  blocks: IngestBlock[]
  /** Bengali alt text for the featured image. Required before anything publishes. */
  imageAlt: string
  tags: string[]
}

export class RewriteError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message)
    this.name = 'RewriteError'
  }
}

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'subheadline', 'summary', 'articleType', 'blocks', 'imageAlt', 'tags'],
  properties: {
    headline: { type: 'string' },
    subheadline: { type: ['string', 'null'] },
    summary: { type: 'string', maxLength: MAX_SUMMARY },
    articleType: { type: 'string', enum: [...SELECTABLE_TYPES] },
    imageAlt: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    blocks: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        // Every key, not just the ones a block actually uses. `strict: true`
        // requires `required` to list all of `properties`; optionality is
        // expressed by the `null` in each type union instead. A paragraph
        // block therefore comes back with `attribution: null` rather than
        // without the key, and `validateBlocks` drops the nulls.
        required: ['type', 'text', 'attribution', 'style', 'items', 'caption'],
        properties: {
          type: { type: 'string', enum: [...GENERATED_BLOCK_TYPES] },
          text: { type: ['string', 'null'] },
          attribution: { type: ['string', 'null'] },
          style: { type: ['string', 'null'], enum: ['bullet', 'number', null] },
          items: { type: ['array', 'null'], items: { type: 'string' } },
          caption: { type: ['string', 'null'] },
        },
      },
    },
  },
} as const

/**
 * The `image` block type is offered to the model but it has no media ids to
 * reference, so any it emits are dropped before validation. Inline imagery is a
 * second pass — the featured image is what the publish guards actually require.
 */
function dropImageBlocks(blocks: unknown): unknown {
  return Array.isArray(blocks)
    ? blocks.filter((block) => (block as { type?: unknown })?.type !== 'image')
    : blocks
}

const SYSTEM_PROMPT = `You are a Bengali news sub-editor for Dhaka Live.

You will be given a news report. Rewrite it in your own words as a Bengali news
article for our masthead.

Rules:
- Write in Bengali. Never output English prose.
- Keep every fact, name, number, date, place and direct quotation exactly as
  given. Do not add detail that is not in the source, and do not soften or
  sharpen what it says.
- Do not name the source outlet or its reporter anywhere in the text.
- Structure the body as blocks: paragraph, subhead, pullQuote, list, divider.
- Use a pullQuote only for a quotation that is already in the source.
- The summary is for listings and social cards: one or two sentences, under
  ${MAX_SUMMARY} characters.
- imageAlt describes the photograph for a reader who cannot see it, in Bengali.
- tags are up to six short Bengali topic labels.

Pick articleType from what the source actually is. The site gives each of these
a different page, so the choice changes how the story is presented:
- standard: a straight news report. Most wire copy is this. When unsure, use it.
- breaking-news: an event happening now, written as it develops.
- feature: a longer piece with narrative or human interest rather than an event.
- analysis: explains why something happened or what follows from it.
- interview: built mainly from one person's answers to questions.
- opinion: an argument by a named writer.
- editorial: an argument in the masthead's own voice, unsigned.
- photo-story: the photographs carry the story and the text supports them.
- video-story: built around a video.

Do not reach for an unusual type to make a story seem more than it is. A report
labelled analysis reads to the reader as a promise the copy does not keep.`

export interface RewriteOptions {
  apiKey: string
  model: string
  signal?: AbortSignal
}

export async function rewriteArticle(
  detail: ArticleDetail,
  options: RewriteOptions,
): Promise<RewriteResult> {
  const client = new OpenAI({ apiKey: options.apiKey, timeout: REQUEST_TIMEOUT_MS })

  const completion = await client.chat.completions.create(
    {
      model: options.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `শিরোনাম: ${detail.title}`,
            detail.sourceCategory ? `বিভাগ: ${detail.sourceCategory}` : '',
            '',
            detail.paragraphs.join('\n\n'),
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'article', strict: true, schema: SCHEMA },
      },
    },
    { signal: options.signal },
  )

  const raw = completion.choices[0]?.message?.content
  if (!raw) throw new RewriteError('Model returned no content', detail.url)

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // `strict: true` should make this unreachable; it is checked anyway because
    // the alternative is a crash inside the write path.
    throw new RewriteError('Model returned content that is not JSON', detail.url)
  }

  const blocks = validateBlocks(dropImageBlocks(parsed.blocks))
  if (!blocks.ok) {
    throw new RewriteError(`Unusable blocks: ${describe(blocks.issues)}`, detail.url)
  }

  const headline = text(parsed.headline)
  const summary = text(parsed.summary)

  // Both are publish guards. Failing here costs one log line; failing at the
  // write costs a round trip and a confusing 400.
  if (!headline) throw new RewriteError('Model returned no headline', detail.url)
  if (!summary) throw new RewriteError('Model returned no summary', detail.url)

  /**
   * Alt text falls back to the headline rather than failing the story.
   *
   * The headline is a poor description of a photograph — it says what happened,
   * not what is in the frame, and a screen reader announces it twice: once as
   * the heading, once where the picture should have been described. It is used
   * anyway because the alternative is worse. Media validates alt as required for
   * images, so an empty one means the story never publishes, and with nobody
   * reviewing the queue that is a silent drop rather than a visible failure.
   *
   * A described image is better than a repeated headline; a repeated headline is
   * better than no story.
   */
  const imageAlt = text(parsed.imageAlt) ?? headline

  const articleType = text(parsed.articleType)

  return {
    headline,
    subheadline: text(parsed.subheadline),
    summary: summary.slice(0, MAX_SUMMARY),
    articleType:
      articleType && (SELECTABLE_TYPES as readonly string[]).includes(articleType)
        ? articleType
        : 'standard',
    blocks: blocks.blocks,
    imageAlt,
    tags: Array.isArray(parsed.tags)
      ? parsed.tags.filter((tag): tag is string => typeof tag === 'string' && tag.trim().length > 0)
      : [],
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function describe(issues: readonly { index: number; message: string }[]): string {
  return issues.map((issue) => `[${issue.index}] ${issue.message}`).join('; ')
}
