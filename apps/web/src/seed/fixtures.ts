import type { Locale } from '@dhakalive/config'
import type { ArticleStatus, ArticleType, Role } from '@dhakalive/core'

/**
 * The development data set.
 *
 * Content only — nothing here knows about Payload. The runner in `./index.ts`
 * turns these records into documents, drives each article through the real
 * workflow transitions, and is what makes the whole thing idempotent.
 *
 * Every string is obviously synthetic. This data is loaded into developer
 * machines and CI, so it must never read as a real story that could be mistaken
 * for published output if it leaked into a screenshot.
 */

/** A value written once per locale. */
export type Localized<T> = Record<Locale, T>

/** Shared password for every seeded account. Dev-only, and the runner says so. */
export const SEED_PASSWORD = 'DhakaLive!Dev123'

/**
 * `.test` is reserved by RFC 2606 and can never be registered, so a seeded
 * account cannot collide with — or send mail to — a real address.
 */
export interface SeedUser {
  key: string
  email: string
  name: string
  role: Role
}

export const USERS: readonly SeedUser[] = [
  {
    key: 'super-admin',
    email: 'superadmin@dhakalive.test',
    name: 'Seed Super Admin',
    role: 'super-admin',
  },
  { key: 'admin', email: 'admin@dhakalive.test', name: 'Seed Administrator', role: 'admin' },
  {
    key: 'publisher',
    email: 'publisher@dhakalive.test',
    name: 'Seed Publisher',
    role: 'publisher',
  },
  { key: 'editor', email: 'editor@dhakalive.test', name: 'Seed Editor', role: 'editor' },
  { key: 'reporter', email: 'reporter@dhakalive.test', name: 'Seed Reporter', role: 'reporter' },
  {
    key: 'contributor',
    email: 'contributor@dhakalive.test',
    name: 'Seed Contributor',
    role: 'contributor',
  },
]

export interface SeedAuthor {
  key: string
  slug: string
  /** Links the public byline to a CMS account, by `SeedUser.key`. */
  userKey?: string
  displayName: Localized<string>
  designation: Localized<string>
  biography: Localized<string>
}

export const AUTHORS: readonly SeedAuthor[] = [
  {
    key: 'rahman',
    slug: 'seed-nusrat-rahman',
    userKey: 'reporter',
    displayName: { bn: 'নুসরাত রহমান', en: 'Nusrat Rahman' },
    designation: { bn: 'জ্যেষ্ঠ প্রতিবেদক, ঢাকা', en: 'Senior Correspondent, Dhaka' },
    biography: {
      bn: 'নমুনা তথ্যের জন্য তৈরি একটি কাল্পনিক প্রোফাইল।',
      en: 'A fictional profile created for seed data.',
    },
  },
  {
    key: 'karim',
    slug: 'seed-tanvir-karim',
    userKey: 'contributor',
    displayName: { bn: 'তানভীর করিম', en: 'Tanvir Karim' },
    designation: { bn: 'প্রতিবেদক', en: 'Staff Reporter' },
    biography: {
      bn: 'নমুনা তথ্যের জন্য তৈরি একটি কাল্পনিক প্রোফাইল।',
      en: 'A fictional profile created for seed data.',
    },
  },
  {
    key: 'haque',
    slug: 'seed-farida-haque',
    userKey: 'editor',
    displayName: { bn: 'ফরিদা হক', en: 'Farida Haque' },
    designation: { bn: 'বার্তা সম্পাদক', en: 'News Editor' },
    biography: {
      bn: 'নমুনা তথ্যের জন্য তৈরি একটি কাল্পনিক প্রোফাইল।',
      en: 'A fictional profile created for seed data.',
    },
  },
  {
    // No account: proves a guest byline works without a login.
    key: 'wire',
    slug: 'seed-newsroom-desk',
    displayName: { bn: 'নিউজরুম ডেস্ক', en: 'Newsroom Desk' },
    designation: { bn: 'সম্পাদকীয় বিভাগ', en: 'Editorial Desk' },
    biography: {
      bn: 'ডেস্ক থেকে তৈরি প্রতিবেদন। নমুনা তথ্য।',
      en: 'Desk-written copy. Seed data.',
    },
  },
]

export interface SeedCategory {
  key: string
  /** Latin in both locales, so seeded URLs stay typeable during development. */
  slug: string
  parentKey?: string
  title: Localized<string>
  description: Localized<string>
  displayOrder: number
}

export const CATEGORIES: readonly SeedCategory[] = [
  {
    key: 'bangladesh',
    slug: 'bangladesh',
    title: { bn: 'বাংলাদেশ', en: 'Bangladesh' },
    description: { bn: 'দেশজুড়ে সংবাদ।', en: 'News from across the country.' },
    displayOrder: 10,
  },
  {
    key: 'politics',
    slug: 'politics',
    title: { bn: 'রাজনীতি', en: 'Politics' },
    description: { bn: 'রাজনৈতিক সংবাদ ও বিশ্লেষণ।', en: 'Political news and analysis.' },
    displayOrder: 20,
  },
  {
    key: 'business',
    slug: 'business',
    title: { bn: 'অর্থনীতি', en: 'Business' },
    description: { bn: 'বাণিজ্য, বাজার ও অর্থনীতি।', en: 'Trade, markets and the economy.' },
    displayOrder: 30,
  },
  {
    key: 'sports',
    slug: 'sports',
    title: { bn: 'খেলা', en: 'Sports' },
    description: { bn: 'দেশ ও বিদেশের খেলাধুলা।', en: 'Sport at home and abroad.' },
    displayOrder: 40,
  },
  {
    key: 'cricket',
    slug: 'cricket',
    parentKey: 'sports',
    title: { bn: 'ক্রিকেট', en: 'Cricket' },
    description: { bn: 'ক্রিকেটের সব খবর।', en: 'Everything cricket.' },
    displayOrder: 10,
  },
  {
    key: 'opinion',
    slug: 'opinion',
    title: { bn: 'মতামত', en: 'Opinion' },
    description: { bn: 'সম্পাদকীয় ও মতামত।', en: 'Editorials and opinion.' },
    displayOrder: 50,
  },
]

export interface SeedTag {
  key: string
  slug: string
  title: Localized<string>
}

export const TAGS: readonly SeedTag[] = [
  { key: 'election', slug: 'election', title: { bn: 'নির্বাচন', en: 'Election' } },
  { key: 'dhaka', slug: 'dhaka', title: { bn: 'ঢাকা', en: 'Dhaka' } },
  { key: 'economy', slug: 'economy', title: { bn: 'অর্থনীতি', en: 'Economy' } },
  { key: 'climate', slug: 'climate', title: { bn: 'জলবায়ু', en: 'Climate' } },
  { key: 'cricket', slug: 'cricket-tag', title: { bn: 'ক্রিকেট', en: 'Cricket' } },
  { key: 'transport', slug: 'transport', title: { bn: 'পরিবহন', en: 'Transport' } },
]

export interface SeedMedia {
  key: string
  filename: string
  /** Flat colour, so images are generated rather than committed as binaries. */
  colour: { r: number; g: number; b: number }
  alt: Localized<string>
  caption: Localized<string>
  credit: string
}

export const MEDIA: readonly SeedMedia[] = [
  {
    key: 'parliament',
    filename: 'seed-parliament.jpg',
    colour: { r: 38, g: 70, b: 83 },
    alt: {
      bn: 'জাতীয় সংসদ ভবনের প্রতীকী ছবি',
      en: 'Placeholder image of the parliament building',
    },
    caption: { bn: 'নমুনা ছবি।', en: 'Placeholder image.' },
    credit: 'Seed Data / Placeholder',
  },
  {
    key: 'market',
    filename: 'seed-market.jpg',
    colour: { r: 42, g: 157, b: 143 },
    alt: { bn: 'কাঁচাবাজারের প্রতীকী ছবি', en: 'Placeholder image of a produce market' },
    caption: { bn: 'নমুনা ছবি।', en: 'Placeholder image.' },
    credit: 'Seed Data / Placeholder',
  },
  {
    key: 'stadium',
    filename: 'seed-stadium.jpg',
    colour: { r: 233, g: 196, b: 106 },
    alt: { bn: 'ক্রিকেট মাঠের প্রতীকী ছবি', en: 'Placeholder image of a cricket ground' },
    caption: { bn: 'নমুনা ছবি।', en: 'Placeholder image.' },
    credit: 'Seed Data / Placeholder',
  },
  {
    key: 'traffic',
    filename: 'seed-traffic.jpg',
    colour: { r: 244, g: 162, b: 97 },
    alt: { bn: 'ঢাকার সড়কের প্রতীকী ছবি', en: 'Placeholder image of a Dhaka street' },
    caption: { bn: 'নমুনা ছবি।', en: 'Placeholder image.' },
    credit: 'Seed Data / Placeholder',
  },
  {
    key: 'river',
    filename: 'seed-river.jpg',
    colour: { r: 231, g: 111, b: 81 },
    alt: { bn: 'নদীতীরের প্রতীকী ছবি', en: 'Placeholder image of a riverbank' },
    caption: { bn: 'নমুনা ছবি।', en: 'Placeholder image.' },
    credit: 'Seed Data / Placeholder',
  },
  {
    key: 'masthead',
    filename: 'seed-masthead.jpg',
    colour: { r: 29, g: 53, b: 87 },
    alt: { bn: 'ডেইলি লাইভের লোগো', en: 'DhakaLive logo placeholder' },
    caption: { bn: 'নমুনা ছবি।', en: 'Placeholder image.' },
    credit: 'Seed Data / Placeholder',
  },
]

/**
 * Where in the workflow a seeded article should come to rest.
 *
 * The runner walks the real transition table to get there, so every state in
 * this list is proof that the path to it is actually traversable by the roles
 * the seed uses. A state that cannot be reached fails the seed loudly.
 */
export type SeedArticleTarget = Exclude<ArticleStatus, never>

export interface SeedArticle {
  key: string
  /** Localised so one story can exercise a Bengali URL segment. */
  slug: Localized<string>
  headline: Localized<string>
  subheadline?: Localized<string>
  summary: Localized<string>
  paragraphs: Localized<readonly string[]>
  categoryKey: string
  tagKeys: readonly string[]
  authorKeys: readonly string[]
  mediaKey: string
  articleType: ArticleType
  target: SeedArticleTarget
  /** Backdates `publishedAt` so listings, archives and feeds have a spread. */
  publishedDaysAgo?: number
  /** Only for `scheduled`; hours from the moment the seed runs. */
  scheduledInHours?: number
  isBreaking?: boolean
  isFeatured?: boolean
  hasCorrection?: boolean
}

function placeholder(locale: Locale, subject: string): readonly string[] {
  return locale === 'bn'
    ? [
        `${subject} নিয়ে এই লেখাটি সম্পূর্ণ কাল্পনিক এবং কেবল ডেভেলপমেন্ট পরিবেশের জন্য তৈরি।`,
        'এই অনুচ্ছেদটি লেআউট, টাইপোগ্রাফি এবং তালিকা পাতার আচরণ পরীক্ষা করার জন্য যথেষ্ট দীর্ঘ রাখা হয়েছে।',
        'কোনো বাস্তব ব্যক্তি, প্রতিষ্ঠান বা ঘটনার সঙ্গে এর কোনো সম্পর্ক নেই।',
      ]
    : [
        `This story about ${subject} is entirely fictional and exists only to populate a development environment.`,
        'The paragraph is kept long enough to exercise layout, typography and the behaviour of listing pages.',
        'It bears no relation to any real person, organisation or event.',
      ]
}

function bodyFor(subject: Localized<string>): Localized<readonly string[]> {
  return { bn: placeholder('bn', subject.bn), en: placeholder('en', subject.en) }
}

export const ARTICLES: readonly SeedArticle[] = [
  // --- Published ------------------------------------------------------------
  {
    key: 'budget',
    slug: { bn: 'budget-session-opens', en: 'budget-session-opens' },
    headline: {
      bn: 'বাজেট অধিবেশন শুরু, আলোচনার কেন্দ্রে মূল্যস্ফীতি',
      en: 'Budget session opens with inflation at the centre of debate',
    },
    subheadline: {
      bn: 'নমুনা উপশিরোনাম',
      en: 'A placeholder standfirst for the seeded story',
    },
    summary: {
      bn: 'ডেভেলপমেন্ট পরিবেশের জন্য তৈরি একটি কাল্পনিক প্রতিবেদন।',
      en: 'A fictional report written to populate a development environment.',
    },
    paragraphs: bodyFor({ bn: 'বাজেট অধিবেশন', en: 'the budget session' }),
    categoryKey: 'politics',
    tagKeys: ['election', 'economy'],
    authorKeys: ['rahman', 'haque'],
    mediaKey: 'parliament',
    articleType: 'standard',
    target: 'published',
    publishedDaysAgo: 0,
    isFeatured: true,
  },
  {
    key: 'breaking-flood',
    slug: { bn: 'flood-warning-issued', en: 'flood-warning-issued' },
    headline: {
      bn: 'উত্তরাঞ্চলে বন্যা সতর্কতা জারি',
      en: 'Flood warning issued for northern districts',
    },
    summary: {
      bn: 'ব্রেকিং নিউজ টিকার পরীক্ষার জন্য তৈরি কাল্পনিক প্রতিবেদন।',
      en: 'A fictional report used to exercise the breaking-news ticker.',
    },
    paragraphs: bodyFor({ bn: 'বন্যা পরিস্থিতি', en: 'the flood warning' }),
    categoryKey: 'bangladesh',
    tagKeys: ['climate'],
    authorKeys: ['wire'],
    mediaKey: 'river',
    articleType: 'breaking-news',
    target: 'published',
    publishedDaysAgo: 0,
    isBreaking: true,
  },
  {
    key: 'metro',
    // The one deliberately Bengali slug: proves percent-encoding, routing and
    // the sitemap all survive a non-Latin URL segment.
    slug: { bn: 'মেট্রোরেল-সম্প্রসারণ', en: 'metro-rail-extension' },
    headline: {
      bn: 'মেট্রোরেলের নতুন অংশ চালুর পরিকল্পনা',
      en: 'Plan announced for a new stretch of the metro rail',
    },
    summary: {
      bn: 'বাংলা স্লাগ পরীক্ষার জন্য তৈরি কাল্পনিক প্রতিবেদন।',
      en: 'A fictional report that exercises a Bengali URL slug.',
    },
    paragraphs: bodyFor({ bn: 'মেট্রোরেল সম্প্রসারণ', en: 'the metro rail extension' }),
    categoryKey: 'bangladesh',
    tagKeys: ['dhaka', 'transport'],
    authorKeys: ['karim'],
    mediaKey: 'traffic',
    articleType: 'feature',
    target: 'published',
    publishedDaysAgo: 1,
  },
  {
    key: 'exports',
    slug: { bn: 'garment-exports-rise', en: 'garment-exports-rise' },
    headline: {
      bn: 'পোশাক রপ্তানিতে প্রবৃদ্ধির ইঙ্গিত',
      en: 'Garment exports point to renewed growth',
    },
    summary: {
      bn: 'অর্থনীতি বিভাগের জন্য তৈরি কাল্পনিক প্রতিবেদন।',
      en: 'A fictional report for the business section.',
    },
    paragraphs: bodyFor({ bn: 'পোশাক রপ্তানি', en: 'garment exports' }),
    categoryKey: 'business',
    tagKeys: ['economy'],
    authorKeys: ['rahman'],
    mediaKey: 'market',
    articleType: 'analysis',
    target: 'published',
    publishedDaysAgo: 2,
    hasCorrection: true,
  },
  {
    key: 'cricket-win',
    slug: { bn: 'series-levelled-in-chattogram', en: 'series-levelled-in-chattogram' },
    headline: {
      bn: 'চট্টগ্রামে সিরিজে সমতা',
      en: 'Series levelled in Chattogram',
    },
    summary: {
      bn: 'খেলা বিভাগের জন্য তৈরি কাল্পনিক প্রতিবেদন।',
      en: 'A fictional report for the sports section.',
    },
    paragraphs: bodyFor({ bn: 'ক্রিকেট সিরিজ', en: 'the cricket series' }),
    categoryKey: 'cricket',
    tagKeys: ['cricket'],
    authorKeys: ['karim'],
    mediaKey: 'stadium',
    articleType: 'standard',
    target: 'published',
    publishedDaysAgo: 3,
  },
  {
    key: 'editorial-transport',
    slug: { bn: 'a-city-that-cannot-move', en: 'a-city-that-cannot-move' },
    headline: {
      bn: 'যে শহর নড়তে পারে না',
      en: 'A city that cannot move',
    },
    summary: {
      bn: 'মতামত বিভাগের জন্য তৈরি কাল্পনিক সম্পাদকীয়।',
      en: 'A fictional editorial for the opinion section.',
    },
    paragraphs: bodyFor({ bn: 'নগর পরিবহন', en: 'urban transport' }),
    categoryKey: 'opinion',
    tagKeys: ['dhaka', 'transport'],
    authorKeys: ['haque'],
    mediaKey: 'traffic',
    articleType: 'editorial',
    target: 'published',
    publishedDaysAgo: 5,
    isFeatured: true,
  },
  {
    key: 'climate-delta',
    slug: { bn: 'delta-plan-review', en: 'delta-plan-review' },
    headline: {
      bn: 'ডেল্টা পরিকল্পনার পর্যালোচনা শুরু',
      en: 'Review of the delta plan gets under way',
    },
    summary: {
      bn: 'আর্কাইভ পাতার জন্য পুরোনো তারিখের কাল্পনিক প্রতিবেদন।',
      en: 'A back-dated fictional report, so the archive pages have depth.',
    },
    paragraphs: bodyFor({ bn: 'ডেল্টা পরিকল্পনা', en: 'the delta plan' }),
    categoryKey: 'bangladesh',
    tagKeys: ['climate'],
    authorKeys: ['wire'],
    mediaKey: 'river',
    articleType: 'feature',
    target: 'published',
    publishedDaysAgo: 40,
  },
  {
    key: 'interview-economist',
    slug: { bn: 'an-interview-on-prices', en: 'an-interview-on-prices' },
    headline: {
      bn: 'দ্রব্যমূল্য নিয়ে সাক্ষাৎকার',
      en: 'An interview on the price of everything',
    },
    summary: {
      bn: 'সাক্ষাৎকার ধরনের জন্য তৈরি কাল্পনিক প্রতিবেদন।',
      en: 'A fictional piece exercising the interview article type.',
    },
    paragraphs: bodyFor({ bn: 'দ্রব্যমূল্য', en: 'consumer prices' }),
    categoryKey: 'business',
    tagKeys: ['economy'],
    authorKeys: ['rahman'],
    mediaKey: 'market',
    articleType: 'interview',
    target: 'published',
    publishedDaysAgo: 9,
  },

  // --- Every other workflow state ------------------------------------------
  {
    key: 'wf-draft',
    slug: { bn: 'workflow-draft', en: 'workflow-draft' },
    headline: { bn: 'কর্মপ্রবাহ: খসড়া', en: 'Workflow fixture: draft' },
    summary: { bn: 'খসড়া অবস্থার নমুনা।', en: 'Fixture resting in the draft state.' },
    paragraphs: bodyFor({ bn: 'খসড়া অবস্থা', en: 'the draft state' }),
    categoryKey: 'bangladesh',
    tagKeys: ['dhaka'],
    authorKeys: ['karim'],
    mediaKey: 'traffic',
    articleType: 'standard',
    target: 'draft',
  },
  {
    key: 'wf-submitted',
    slug: { bn: 'workflow-submitted', en: 'workflow-submitted' },
    headline: { bn: 'কর্মপ্রবাহ: জমা দেওয়া', en: 'Workflow fixture: submitted' },
    summary: { bn: 'রিভিউয়ের অপেক্ষায় থাকা নমুনা।', en: 'Fixture waiting in the review queue.' },
    paragraphs: bodyFor({ bn: 'জমা দেওয়া অবস্থা', en: 'the submitted state' }),
    categoryKey: 'politics',
    tagKeys: ['election'],
    authorKeys: ['karim'],
    mediaKey: 'parliament',
    articleType: 'standard',
    target: 'submitted',
  },
  {
    key: 'wf-in-review',
    slug: { bn: 'workflow-in-review', en: 'workflow-in-review' },
    headline: { bn: 'কর্মপ্রবাহ: পর্যালোচনায়', en: 'Workflow fixture: in review' },
    summary: { bn: 'সম্পাদকের হাতে থাকা নমুনা।', en: 'Fixture claimed by an editor.' },
    paragraphs: bodyFor({ bn: 'পর্যালোচনা অবস্থা', en: 'the in-review state' }),
    categoryKey: 'business',
    tagKeys: ['economy'],
    authorKeys: ['karim'],
    mediaKey: 'market',
    articleType: 'standard',
    target: 'in-review',
  },
  {
    key: 'wf-changes',
    slug: { bn: 'workflow-changes-requested', en: 'workflow-changes-requested' },
    headline: { bn: 'কর্মপ্রবাহ: সংশোধন চাওয়া হয়েছে', en: 'Workflow fixture: changes requested' },
    summary: { bn: 'লেখকের কাছে ফেরত পাঠানো নমুনা।', en: 'Fixture bounced back to its author.' },
    paragraphs: bodyFor({ bn: 'সংশোধন চাওয়া অবস্থা', en: 'the changes-requested state' }),
    categoryKey: 'sports',
    tagKeys: ['cricket'],
    authorKeys: ['karim'],
    mediaKey: 'stadium',
    articleType: 'standard',
    target: 'changes-requested',
  },
  {
    key: 'wf-approved',
    slug: { bn: 'workflow-approved', en: 'workflow-approved' },
    headline: { bn: 'কর্মপ্রবাহ: অনুমোদিত', en: 'Workflow fixture: approved' },
    summary: {
      bn: 'প্রকাশের অপেক্ষায় থাকা নমুনা।',
      en: 'Fixture approved and awaiting publication.',
    },
    paragraphs: bodyFor({ bn: 'অনুমোদিত অবস্থা', en: 'the approved state' }),
    categoryKey: 'opinion',
    tagKeys: ['dhaka'],
    authorKeys: ['haque'],
    mediaKey: 'parliament',
    articleType: 'opinion',
    target: 'approved',
  },
  {
    key: 'wf-scheduled',
    slug: { bn: 'workflow-scheduled', en: 'workflow-scheduled' },
    headline: { bn: 'কর্মপ্রবাহ: নির্ধারিত সময়ে প্রকাশ', en: 'Workflow fixture: scheduled' },
    summary: {
      bn: 'ওয়ার্কারের নির্ধারিত প্রকাশ পরীক্ষার নমুনা।',
      en: 'Fixture that the worker should publish when its time arrives.',
    },
    paragraphs: bodyFor({ bn: 'নির্ধারিত প্রকাশ', en: 'scheduled publication' }),
    categoryKey: 'bangladesh',
    tagKeys: ['climate'],
    authorKeys: ['rahman'],
    mediaKey: 'river',
    articleType: 'standard',
    target: 'scheduled',
    scheduledInHours: 2,
  },
  {
    key: 'wf-unpublished',
    slug: { bn: 'workflow-unpublished', en: 'workflow-unpublished' },
    headline: { bn: 'কর্মপ্রবাহ: প্রকাশ প্রত্যাহার', en: 'Workflow fixture: unpublished' },
    summary: {
      bn: 'প্রকাশের পর প্রত্যাহার করা নমুনা।',
      en: 'Fixture published and then withdrawn again.',
    },
    paragraphs: bodyFor({ bn: 'প্রত্যাহার অবস্থা', en: 'the unpublished state' }),
    categoryKey: 'politics',
    tagKeys: ['election'],
    authorKeys: ['rahman'],
    mediaKey: 'parliament',
    articleType: 'standard',
    target: 'unpublished',
    publishedDaysAgo: 6,
  },
  {
    key: 'wf-archived',
    slug: { bn: 'workflow-archived', en: 'workflow-archived' },
    headline: { bn: 'কর্মপ্রবাহ: আর্কাইভ', en: 'Workflow fixture: archived' },
    summary: { bn: 'আর্কাইভ করা নমুনা।', en: 'Fixture moved into the archive.' },
    paragraphs: bodyFor({ bn: 'আর্কাইভ অবস্থা', en: 'the archived state' }),
    categoryKey: 'sports',
    tagKeys: ['cricket'],
    authorKeys: ['karim'],
    mediaKey: 'stadium',
    articleType: 'standard',
    target: 'archived',
  },
]

export interface SeedPage {
  key: string
  slug: string
  title: Localized<string>
  paragraphs: Localized<readonly string[]>
  showInFooter: boolean
}

export const PAGES: readonly SeedPage[] = [
  {
    key: 'about',
    slug: 'about',
    title: { bn: 'আমাদের সম্পর্কে', en: 'About us' },
    paragraphs: bodyFor({ bn: 'আমাদের সম্পর্কে', en: 'this publication' }),
    showInFooter: false,
  },
  {
    key: 'privacy',
    slug: 'privacy',
    title: { bn: 'গোপনীয়তা নীতি', en: 'Privacy policy' },
    paragraphs: bodyFor({ bn: 'গোপনীয়তা নীতি', en: 'the privacy policy' }),
    showInFooter: true,
  },
  {
    key: 'terms',
    slug: 'terms',
    title: { bn: 'ব্যবহারের শর্তাবলি', en: 'Terms of use' },
    paragraphs: bodyFor({ bn: 'ব্যবহারের শর্ত', en: 'the terms of use' }),
    showInFooter: true,
  },
  {
    key: 'contact',
    slug: 'contact',
    title: { bn: 'যোগাযোগ', en: 'Contact' },
    paragraphs: bodyFor({ bn: 'যোগাযোগ', en: 'contacting the newsroom' }),
    showInFooter: true,
  },
]

export interface SeedAdvertisement {
  key: string
  name: string
  advertiser: string
  placement: 'leaderboard' | 'in-article' | 'footer'
  mediaKey: string
  destinationUrl: string
  weight: number
  /** Section slug, when the booking is targeted. */
  categoryKey?: string
}

/**
 * Two bookings, so the slots render in development and so the weighting and
 * targeting rules have something to act on. `example.com` is reserved by
 * RFC 2606 and cannot be registered, so a seeded creative cannot link anywhere
 * real.
 */
export const ADVERTISEMENTS: readonly SeedAdvertisement[] = [
  {
    key: 'leaderboard-house',
    name: 'Seed — leaderboard',
    advertiser: 'Seed Advertiser',
    placement: 'leaderboard',
    mediaKey: 'masthead',
    destinationUrl: 'https://example.com/',
    weight: 3,
  },
  {
    key: 'in-article-business',
    name: 'Seed — in-article, business only',
    advertiser: 'Seed Advertiser',
    placement: 'in-article',
    mediaKey: 'market',
    destinationUrl: 'https://example.com/business',
    weight: 1,
    categoryKey: 'business',
  },
]

export interface SeedLiveBlogUpdate {
  key: string
  minutesAgo: number
  headline: Localized<string>
  paragraphs: Localized<readonly string[]>
  isPinned?: boolean
  isCorrection?: boolean
}

export interface SeedLiveBlog {
  key: string
  slug: string
  title: Localized<string>
  summary: Localized<string>
  authorKeys: readonly string[]
  relatedArticleKey: string
  updates: readonly SeedLiveBlogUpdate[]
}

export const LIVE_BLOG: SeedLiveBlog = {
  key: 'budget-live',
  slug: 'budget-day-live',
  title: { bn: 'বাজেট দিবস: সরাসরি', en: 'Budget day: live coverage' },
  summary: {
    bn: 'লাইভ ব্লগ পরীক্ষার জন্য তৈরি কাল্পনিক কভারেজ।',
    en: 'Fictional coverage created to exercise the live blog.',
  },
  authorKeys: ['rahman', 'haque'],
  relatedArticleKey: 'budget',
  updates: [
    {
      key: 'open',
      minutesAgo: 240,
      headline: { bn: 'অধিবেশন শুরু', en: 'Session opens' },
      paragraphs: bodyFor({ bn: 'অধিবেশনের সূচনা', en: 'the opening of the session' }),
      isPinned: true,
    },
    {
      key: 'speech',
      minutesAgo: 150,
      headline: { bn: 'বাজেট বক্তৃতা চলছে', en: 'Budget speech under way' },
      paragraphs: bodyFor({ bn: 'বাজেট বক্তৃতা', en: 'the budget speech' }),
    },
    {
      key: 'reaction',
      minutesAgo: 60,
      headline: { bn: 'প্রতিক্রিয়া আসছে', en: 'Reaction starts to arrive' },
      paragraphs: bodyFor({ bn: 'প্রতিক্রিয়া', en: 'the reaction' }),
    },
    {
      key: 'correction',
      minutesAgo: 30,
      headline: { bn: 'সংশোধনী', en: 'Correction' },
      paragraphs: bodyFor({ bn: 'একটি সংখ্যার সংশোধন', en: 'a corrected figure' }),
      isCorrection: true,
    },
  ],
}
