# Fonts

Self-hosted faces served from `/fonts/…`. Everything else on the site is loaded
through `next/font`, which fingerprints and preloads for us; these are here
because the face is not on Google Fonts.

## SolaimanLipi

- `solaimanlipi-400.woff2`
- `solaimanlipi-700.woff2`

The face Bengali readers know from a decade of newspapers, and what this site
sets its Bengali text in. Declared in
`apps/web/src/app/(frontend)/globals.css` as the first family in both the
display and body stacks, restricted by `unicode-range` to Bengali codepoints so
Latin text falls through to Noto — SolaimanLipi's Latin glyphs are an
afterthought and a headline mixing in "SDG" or a scoreline looks broken in them.

Licensed under the SIL Open Font License 1.0, which is what makes
redistributing them here — rather than hotlinking a font CDN on every page
load — the right call. The licence notice is carried in the fonts' own name
table.

Obtained as web-ready WOFF2 from [Bangla Web
Fonts](https://banglawebfonts.pages.dev/font/solaiman-lipi/) and renamed. They
are deliberately **not** subsetted: Bengali conjuncts are built by GSUB, and a
subsetting pass that drops layout features turns every যুক্তাক্ষর into separate
consonants with a visible hasant. If they are ever re-cut, keep
`--layout-features="*"`:

```
pyftsubset SolaimanLipi.ttf --unicodes="U+0964-0965,U+0980-09FF,U+200C-200D,U+20B9,U+25CC" \
  --layout-features="*" --flavor=woff2 --output-file=solaimanlipi-400.woff2
```
