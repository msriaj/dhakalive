/**
 * Where the line falls between a topic and an accident of tagging.
 *
 * The desk creates tags freely, which is right for editing and wrong for
 * crawling: 977 tags against 395 articles, and the great majority listing a
 * single story. To a crawler each of those is the same page — identical
 * navigation, identical footer, one headline of difference — and Google treated
 * them accordingly, leaving 784 in "Discovered - currently not indexed" and
 * spending what crawl budget it did use on tags instead of on the journalism.
 * A `site:` search returned seven tag pages and almost no articles.
 *
 * Three is the point where a tag is evidence of a subject the paper actually
 * covers rather than a label someone typed once. Tags below it stay on the site
 * and stay linked — they are useful to a reader who follows one — but they are
 * kept out of the sitemap and marked `noindex, follow`.
 */
export const MIN_INDEXABLE_TAG_ARTICLES = 3

/**
 * Whether a tag with this many published articles should be offered to search
 * engines — in the sitemap, and as an indexable page.
 *
 * A single predicate used by both, because the two must agree: a URL submitted
 * in a sitemap that then says `noindex` is a contradiction a crawler has to
 * spend a fetch to discover.
 */
export function isIndexableTag(articleCount: number): boolean {
  return articleCount >= MIN_INDEXABLE_TAG_ARTICLES
}
