import { redirect } from 'next/navigation'

import { DEFAULT_LOCALE } from '@dhakalive/config'

import { homePath } from '../../lib/routes'

/**
 * The bare origin redirects to the default locale.
 *
 * A permanent redirect so the canonical form is `/bn` rather than `/`, and so
 * the CDN and search engines both settle on one URL for the front page.
 */
export default function RootPage(): never {
  redirect(homePath(DEFAULT_LOCALE))
}
