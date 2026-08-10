import config from '@payload-config'
import { GRAPHQL_PLAYGROUND_GET } from '@payloadcms/next/routes'

// Disabled in production by `graphQL.disablePlaygroundInProduction` in the config.
export const dynamic = 'force-dynamic'

export const GET = GRAPHQL_PLAYGROUND_GET(config)
