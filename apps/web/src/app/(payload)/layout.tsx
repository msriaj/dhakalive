import config from '@payload-config'
import '@payloadcms/next/css'
import { handleServerFunctions, RootLayout } from '@payloadcms/next/layouts'
import type { ServerFunctionClient } from 'payload'
import type React from 'react'

import { importMap } from './admin/importMap.js'

/**
 * The `(payload)` route group owns /admin and /api. It deliberately does not
 * import the frontend stylesheet: Tailwind's preflight would reset Payload's
 * own admin styling. Keeping the two route groups stylistically isolated is
 * what allows the site and the CMS to share one deployment safely.
 */

interface Args {
  children: React.ReactNode
}

const serverFunction: ServerFunctionClient = async function (args) {
  'use server'
  return handleServerFunctions({ ...args, config, importMap })
}

export default function PayloadLayout({ children }: Args) {
  return (
    <RootLayout config={config} importMap={importMap} serverFunction={serverFunction}>
      {children}
    </RootLayout>
  )
}
