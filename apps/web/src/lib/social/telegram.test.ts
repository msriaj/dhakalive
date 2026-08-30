import { describe, expect, it } from 'vitest'

import { parseApprovalCallback } from './telegram'

describe('parseApprovalCallback', () => {
  it('parses the payloads this flow mints', () => {
    expect(parseApprovalCallback('approve:412')).toEqual({
      decision: 'approve',
      articleId: '412',
    })
    expect(parseApprovalCallback('decline:abc-123')).toEqual({
      decision: 'decline',
      articleId: 'abc-123',
    })
  })

  it('rejects everything else', () => {
    // callback_data arrives from the network; anything unrecognised is noise,
    // never an error worth surfacing.
    for (const data of [
      'approve:',
      'publish:412',
      'approve:412:extra',
      'approve:../412',
      '',
      42,
      null,
      undefined,
      { decision: 'approve' },
    ]) {
      expect(parseApprovalCallback(data)).toBeNull()
    }
  })
})
