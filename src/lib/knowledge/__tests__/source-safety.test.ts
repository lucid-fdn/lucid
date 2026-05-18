import { describe, expect, it } from 'vitest'

import {
  assertKnowledgeSourceUrlSafe,
  evaluateKnowledgeSourceUrlSafety,
} from '../source-safety'

describe('Knowledge source safety', () => {
  it('allows public http and https source URLs', () => {
    expect(evaluateKnowledgeSourceUrlSafety('https://docs.example.com/guide').safe).toBe(true)
    expect(evaluateKnowledgeSourceUrlSafety('http://example.com/feed').safe).toBe(true)
  })

  it('rejects local, private, and metadata source URLs', () => {
    for (const url of [
      'http://localhost:3000',
      'http://127.0.0.1/admin',
      'http://10.0.0.5/secret',
      'http://172.16.1.1/secret',
      'http://192.168.1.2/secret',
      'http://169.254.169.254/latest/meta-data',
      'http://metadata.google.internal/computeMetadata/v1',
      'http://[::1]/',
      'http://[fd00::1]/',
    ]) {
      expect(evaluateKnowledgeSourceUrlSafety(url), url).toMatchObject({ safe: false })
    }
  })

  it('throws a typed error for unsafe URLs', () => {
    expect(() => assertKnowledgeSourceUrlSafe('file:///etc/passwd')).toThrow(/Knowledge source URL rejected/)
  })
})
