import { LOCALES } from '@dhakalive/config'
import { AD_PLACEMENTS } from '@dhakalive/core'

/**
 * Option lists for the Advertisements collection.
 *
 * In their own module so the collection file imports them by name rather than
 * assembling them inline — the placement list is shared with the renderer and
 * the selection rules, and it must be the same list in all three.
 */

export { AD_PLACEMENTS }

export const LOCALES_LABEL = LOCALES.map((locale) => ({
  label: locale === 'bn' ? 'Bengali' : 'English',
  value: locale,
}))
