import { describe, expect, it } from 'vitest'

import { buildToolManifestHash, prepareToolManifest } from '../tool-manifest.js'

describe('prepareToolManifest', () => {
  it('normalizes nested array schemas to include items', () => {
    const prepared = prepareToolManifest([
      {
        name: 'notion__append_block_children',
        description: 'Append blocks',
        parameters: {
          type: 'object',
          properties: {
            children: {
              type: 'array',
            },
          },
        },
      },
    ], { dropInvalidTools: true })

    expect(prepared.metadata.hasErrors).toBe(false)
    expect(prepared.tools[0].parameters).toEqual({
      type: 'object',
      properties: {
        children: {
          type: 'array',
          items: {},
        },
      },
    })
    expect(prepared.issues).toEqual([
      expect.objectContaining({
        code: 'schema_array_missing_items',
        severity: 'warning',
      }),
    ])
  })

  it('drops invalid tools when requested while preserving valid tools', () => {
    const prepared = prepareToolManifest([
      {
        name: 'valid_tool',
        description: 'Valid tool',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: '',
        description: 'Broken tool',
        parameters: { type: 'string' },
      },
    ], { dropInvalidTools: true })

    expect(prepared.tools).toHaveLength(1)
    expect(prepared.tools[0].name).toBe('valid_tool')
    expect(prepared.metadata.invalidToolCount).toBe(1)
    expect(prepared.metadata.hasErrors).toBe(true)
  })
})

describe('buildToolManifestHash', () => {
  it('is stable for semantically identical manifests', () => {
    const first = buildToolManifestHash([
      {
        name: 'tool',
        description: 'Tool',
        parameters: {
          type: 'object',
          properties: {
            alpha: { type: 'string' },
            beta: { type: 'number' },
          },
        },
      },
    ])

    const second = buildToolManifestHash([
      {
        name: 'tool',
        description: 'Tool',
        parameters: {
          properties: {
            beta: { type: 'number' },
            alpha: { type: 'string' },
          },
          type: 'object',
        },
      },
    ])

    expect(first).toBe(second)
  })
})
