import { describe, expect, it } from 'vitest'

import { SCHEMA } from './rewrite.js'

/**
 * Guards the shape of the response schema, not the rewrite itself.
 *
 * OpenAI validates `strict: true` schemas server-side and rejects the whole
 * request, so a malformed one is not a bad article — it is every article
 * failing, discovered from production logs. The rules it enforces are narrower
 * than JSON Schema's: an object must forbid extra properties, and `required`
 * must name every key in `properties`, with optionality expressed by a `null`
 * in the type union instead. That second rule is the counterintuitive one, and
 * getting it wrong is what took the pipeline down.
 *
 * Checked here rather than against the API because a test that needs a key and
 * a network round trip is a test that gets skipped in CI.
 */

/** `SCHEMA` is `as const`, so every array on it arrives readonly. */
interface SchemaNode {
  type?: unknown
  properties?: Readonly<Record<string, SchemaNode>>
  required?: readonly string[]
  additionalProperties?: unknown
  items?: SchemaNode
}

/** Every object node in the schema, with a path for a legible failure message. */
function objectNodes(node: SchemaNode, path = 'root'): [string, SchemaNode][] {
  const found: [string, SchemaNode][] = []

  const types = Array.isArray(node.type) ? node.type : [node.type]
  if (types.includes('object')) found.push([path, node])

  for (const [key, child] of Object.entries(node.properties ?? {})) {
    found.push(...objectNodes(child, `${path}.${key}`))
  }
  if (node.items) found.push(...objectNodes(node.items, `${path}[]`))

  return found
}

describe('SCHEMA', () => {
  const nodes = objectNodes(SCHEMA)

  it('describes at least the root and the block items', () => {
    // Guards the walker: if it stopped descending, every assertion below would
    // pass vacuously over an empty list.
    expect(nodes.map(([path]) => path)).toEqual(['root', 'root.blocks[]'])
  })

  it.each(nodes)('%s lists every property as required', (_path, node) => {
    expect([...(node.required ?? [])].sort()).toEqual(Object.keys(node.properties ?? {}).sort())
  })

  it.each(nodes)('%s forbids additional properties', (_path, node) => {
    expect(node.additionalProperties).toBe(false)
  })
})
