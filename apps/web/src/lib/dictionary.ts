import type { Locale } from '@dhakalive/config'

/**
 * UI strings for the public site.
 *
 * Editorial content is localised in Payload; this covers the chrome — labels,
 * headings and accessible names that are not content. Kept as a plain typed
 * object rather than a translation library: the surface is small, and a missing
 * key is a compile error rather than a runtime fallback string.
 */
const STRINGS = {
  skipToContent: { bn: 'মূল অংশে যান', en: 'Skip to content' },
  mainNavigation: { bn: 'প্রধান নেভিগেশন', en: 'Main navigation' },
  footerNavigation: { bn: 'ফুটার নেভিগেশন', en: 'Footer navigation' },
  breadcrumb: { bn: 'ব্রেডক্রাম্ব', en: 'Breadcrumb' },
  home: { bn: 'হোম', en: 'Home' },
  search: { bn: 'অনুসন্ধান', en: 'Search' },
  menu: { bn: 'মেনু', en: 'Menu' },
  closeMenu: { bn: 'মেনু বন্ধ করুন', en: 'Close menu' },
  openMenu: { bn: 'মেনু খুলুন', en: 'Open menu' },
  /** Accessible name for the chevron that reveals a section's sub-sections. */
  showSubsections: { bn: 'উপবিভাগ দেখান', en: 'Show subsections' },
  latest: { bn: 'সর্বশেষ', en: 'Latest' },
  breaking: { bn: 'ব্রেকিং', en: 'Breaking' },
  /** Fallback label for the topics strip when an editor has cleared the heading. */
  trendingTopics: { bn: 'আলোচিত বিষয়', en: 'Trending topics' },
  /** Accessible name for the unheaded card row beneath the lead assembly. */
  moreTopStories: { bn: 'আরও প্রধান খবর', en: 'More top stories' },
  /** Footer bands. Each is a heading an editor may override in the CMS. */
  otherPublications: { bn: 'আমাদের অন্যান্য প্রকাশনা', en: 'Our other publications' },
  followUs: { bn: 'অনুসরণ করুন', en: 'Follow us' },
  downloadApps: { bn: 'মোবাইল অ্যাপস ডাউনলোড করুন', en: 'Download the mobile apps' },
  relatedStories: { bn: 'সম্পর্কিত খবর', en: 'Related stories' },
  moreFrom: { bn: 'আরও', en: 'More from' },
  publishedOn: { bn: 'প্রকাশিত', en: 'Published' },
  updatedOn: { bn: 'হালনাগাদ', en: 'Updated' },
  by: { bn: 'লিখেছেন', en: 'By' },
  correction: { bn: 'সংশোধনী', en: 'Correction' },
  share: { bn: 'শেয়ার', en: 'Share' },
  shareOn: { bn: 'শেয়ার করুন', en: 'Share on' },
  copyLink: { bn: 'লিঙ্ক কপি করুন', en: 'Copy link' },
  tags: { bn: 'ট্যাগ', en: 'Tags' },
  page: { bn: 'পৃষ্ঠা', en: 'Page' },
  previous: { bn: 'পূর্ববর্তী', en: 'Previous' },
  next: { bn: 'পরবর্তী', en: 'Next' },
  advertisement: { bn: 'বিজ্ঞাপন', en: 'Advertisement' },
  noResults: { bn: 'কোনো ফলাফল পাওয়া যায়নি', en: 'No results found' },
  searchPlaceholder: { bn: 'সংবাদ খুঁজুন', en: 'Search the news' },
  searchPrompt: { bn: 'কী খুঁজছেন তা লিখুন।', en: 'Type what you are looking for.' },
  /** Rendered after a formatted number, so it is a bare noun in both languages. */
  resultsLabel: { bn: 'ফলাফল', en: 'results' },
  approximateResults: {
    bn: 'হুবহু মিল পাওয়া যায়নি। কাছাকাছি ফলাফল দেখানো হচ্ছে।',
    en: 'No exact matches. Showing close results instead.',
  },
  searchUnavailable: {
    bn: 'অনুসন্ধান এই মুহূর্তে কাজ করছে না। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    en: 'Search is unavailable right now. Please try again shortly.',
  },
  notFoundTitle: { bn: 'পৃষ্ঠাটি পাওয়া যায়নি', en: 'Page not found' },
  notFoundBody: {
    bn: 'আপনি যে পৃষ্ঠাটি খুঁজছেন তা সরানো হয়েছে বা কখনো ছিল না।',
    en: 'The page you are looking for has moved or never existed.',
  },
  errorTitle: { bn: 'কিছু একটা ভুল হয়েছে', en: 'Something went wrong' },
  errorBody: {
    bn: 'সমস্যাটি আমাদের জানানো হয়েছে। আবার চেষ্টা করুন।',
    en: 'The problem has been reported. Please try again.',
  },
  tryAgain: { bn: 'আবার চেষ্টা করুন', en: 'Try again' },
  backToHome: { bn: 'হোমে ফিরুন', en: 'Back to home' },
  liveNow: { bn: 'লাইভ', en: 'Live' },
  liveEnded: { bn: 'শেষ হয়েছে', en: 'Ended' },
  pinned: { bn: 'পিন করা', en: 'Pinned' },
  archiveFor: { bn: 'আর্কাইভ', en: 'Archive for' },
  articlesBy: { bn: 'এর প্রতিবেদন', en: 'Articles by' },
  switchLanguage: { bn: 'English', en: 'বাংলা' },
} as const satisfies Record<string, Record<Locale, string>>

export type UiKey = keyof typeof STRINGS

export function t(key: UiKey, locale: Locale): string {
  return STRINGS[key][locale]
}

/** Bound helper, so templates read `d('search')` rather than repeating the locale. */
export function dictionary(locale: Locale): (key: UiKey) => string {
  return (key) => STRINGS[key][locale]
}
