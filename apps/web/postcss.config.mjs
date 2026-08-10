/**
 * Tailwind v4 runs entirely through its PostCSS plugin. Scope is controlled by
 * where the stylesheet is imported — only `app/(frontend)` pulls it in, so
 * Tailwind's preflight reset can never reach the Payload admin UI.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
