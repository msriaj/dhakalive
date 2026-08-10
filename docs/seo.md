# SEO, feeds and commercial placements

What the site publishes for machines: structured data, sitemaps, feeds,
redirects, and the one commercial surface that touches them.

Page metadata — titles, descriptions, canonicals, hreflang, Open Graph — is
built by `lib/metadata.ts` and documented at its call sites. This covers
everything else.

## Structured data

Every page emits one `<script type="application/ld+json">` containing a single
`@graph`, rather than several separate blocks. Nodes then reference each other
by `@id`: an article points at the organisation that published it instead of
describing it again, which is what stops a consumer treating each block as an
unrelated entity.

| Page         | Nodes                                          |
| ------------ | ---------------------------------------------- |
| Home         | `NewsMediaOrganization`, `WebSite`             |
| Article      | + `NewsArticle`, `BreadcrumbList`              |
| Section, tag | + `CollectionPage`, `BreadcrumbList`           |
| Author       | + `CollectionPage`, `Person`, `BreadcrumbList` |

The builders live in `packages/core/src/seo/json-ld.ts` as pure functions over
plain values. Structured data is invisible in a browser and wrong output shows
up weeks later in Search Console, so it is unit-tested rather than eyeballed.

Things that are easy to get wrong and are pinned by tests:

- The final breadcrumb carries no `item`. Pointing it at the page it is on is
  the "breadcrumb links to itself" warning.
- Headlines are truncated at 110 characters, which consumers reject outright.
- `dateModified` falls back to `datePublished`; omitting it reads as "never
  updated", which is wrong for a corrected story.
- Empty values are omitted rather than emitted as `null` or `""` — a present
  but empty property asserts that the value is genuinely blank.

### Escaping

Serialisation escapes `<` and the U+2028/U+2029 line terminators. Without the
first, a headline containing `</script>` closes the block early and injects the
remainder into the page as markup — the entire attack surface of embedding data
in a script tag.

## Sitemaps

```
/sitemap.xml                 index — the only URL that needs to stay stable
/sitemaps/news.xml           Google News, last 48 hours
/sitemaps/taxonomy.xml       home, sections, tags, bylines, standing pages
/sitemaps/articles-N.xml     articles, 2,000 URLs per chunk
```

Hand-built rather than Next's `sitemap.ts` convention, because the news sitemap
needs the `news:` namespace and `MetadataRoute.Sitemap` cannot express it —
and generating one sitemap by a different mechanism from the rest is worse than
generating all of them the same way.

Decisions:

- **`allowIndexing: false` suppresses robots.txt content and every sitemap.** A
  `noindex` tag is only seen after a page is fetched; a sitemap is an active
  invitation that crawlers act on first. This is how a staging domain ends up in
  search results despite `noindex` everywhere.
- **Out-of-range chunks 404**, rather than returning an empty document. An empty
  sitemap is valid, so a crawler keeps the URL indefinitely; a 404 makes it drop
  it, which is right when the archive shrinks.
- **Generation failures serve an empty but valid document**, not a 500, so a
  crawler does not learn the sitemap is unreliable and back off.
- Article entries carry `hreflang` alternates, so the bn and en URLs of one
  story are understood as translations rather than duplicates.
- Namespaces are declared only when used. An unused news namespace invites
  Google to treat an ordinary sitemap as a news one and report its entries as
  stale.

## Feeds

```
/{locale}/rss.xml              /{locale}/atom.xml
/{locale}/{section}/rss.xml    /{locale}/{section}/atom.xml
```

Both formats, from one shared item list — the formats differ in serialisation,
not in what they say, and building the list twice is how they come to disagree.

**Summaries only, never full bodies.** A full-text feed is scraped and
republished within minutes, which means a newsroom's own work outranking it.

Format differences that are exactly opposite, and are covered by tests:

|                | RSS 2.0  | Atom 1.0  |
| -------------- | -------- | --------- |
| Dates          | RFC 822  | ISO 8601  |
| `updated`      | optional | mandatory |
| Enclosure size | required | optional  |

Attribution uses `dc:creator` rather than RSS's own `author`, which requires an
email address — publishing a journalist's address is not what a byline implies.

Section feeds exist only for categories. A standing page shares the
single-segment URL space but has no stream behind it, so it 404s rather than
serving an empty feed a reader would poll forever.

Autodiscovery links are emitted by `buildMetadata`, not by a layout: Next
replaces `alternates` wholesale when a child route sets it, so a layout-level
declaration disappears on every page that has a canonical URL.

## Redirects

A published article whose slug or section changes records a redirect
automatically. Before this existed, the old URL was purged from the caches and
then left 404-ing for everyone who had bookmarked or linked it.

Editors can also add entries by hand. Automatic entries never overwrite a manual
one: if somebody has already decided where a URL goes, a slug change is not
grounds to silently disagree.

### Why the destination is validated

An editable redirect table is an open-redirect vector wearing the publication's
domain — the reason open redirects are worth anything to an attacker.

- Destinations are a site-relative path, or an `https` URL on an explicitly
  allowed host. Nothing else.
- `javascript:` and `data:` fail a protocol allowlist rather than a denylist, so
  an unfamiliar scheme is refused by default.
- `//evil.example` is rejected; it looks like a path and is a URL.
- Self-redirects and cycles are refused at write time, and the resolver refuses
  to follow one at read time in case the table is written around that check.

### Resolution

Redirects are resolved at the point a route is about to 404, not in middleware.
Middleware would charge every reader a database lookup in order to serve the
small minority following a stale link; here the cost falls only on requests that
were already going to fail.

Paths are normalised to one canonical form — percent-decoded, no query or
fragment, no trailing slash, repeated slashes collapsed — so `/bn/%E0%A6%AC` and
`/bn/ব` are the same entry. Half the redirects on a Bengali site would silently
never match otherwise.

`permanence` is `permanent` or `temporary`, not a status code: Next emits 308
and 307, and offering a choice of 301 or 302 would be a field the platform then
ignored. Search engines treat 308 exactly as 301.

## Advertisements

Three placements — `leaderboard`, `in-article`, `footer` — booked with a
schedule, a weight, and optional locale and section targeting.

**There is no HTML or script creative field, deliberately.** A pasted network
tag is arbitrary JavaScript running with the publication's origin: it can read a
logged-in editor's session cookie, rewrite the story around it, and load further
scripts from anywhere. It would also make `ads:manage` quietly mean "can execute
code on every page". A creative is an uploaded image and an http(s) destination,
rendered by our own component.

Integrating a real ad network is separate work that belongs behind a Content
Security Policy with an explicit `script-src` allowlist — Phase 8 — and not a
text field.

Selection rules are pure and tested:

- An empty targeting list means run-of-site, not "matches nothing".
- A malformed date means "not running", so a campaign fails to appear rather
  than failing to stop.
- Weight zero pauses a booking without disturbing it.

Rotation is across pages, not impressions. Static pages serve whatever was
chosen at render time, so the choice is seeded on slot plus page: two stories in
the same section show different creatives, and weighting works out across the
site. Per-impression serving would have to happen in the browser or at the edge.

Disclosure is rendered by the component rather than being an editor-supplied
field, so a paid placement cannot go out unmarked. Links carry
`rel="sponsored nofollow noopener"`.
