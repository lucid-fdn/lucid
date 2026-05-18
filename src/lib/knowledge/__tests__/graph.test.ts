import { describe, expect, it } from 'vitest'

import {
  extractKnowledgeEntitiesFromText,
  graphExpansionBoost,
  inferKnowledgeRelationships,
  normalizeKnowledgeEntityName,
} from '../graph'

describe('knowledge graph helpers', () => {
  it('normalizes entity names deterministically', () => {
    expect(normalizeKnowledgeEntityName(' https://GitHub.com/Lucid-FDN/Lucid ')).toBe('github.com/lucid-fdn/lucid')
  })

  it('extracts deterministic operational entities without LLM calls', () => {
    const entities = extractKnowledgeEntitiesFromText(
      'Browser Operator checks PR #42 in lucid-fdn/lucid-cloud and reports to #qa on Slack. Decision: use Hermes for memory mutation.',
    )

    expect(entities.map((entity) => `${entity.type}:${entity.canonicalName}`)).toEqual(expect.arrayContaining([
      'agent:Browser Operator',
      'pull_request:PR #42',
      'repo:lucid-fdn/lucid-cloud',
      'channel:#qa',
      'integration:Slack',
      'integration:Hermes',
    ]))
  })

  it('infers bounded typed relationships between extracted entities', () => {
    const entities = extractKnowledgeEntitiesFromText('Browser Operator uses Slack and works on lucid-fdn/lucid-cloud.')
    const relationships = inferKnowledgeRelationships(entities)

    expect(relationships.length).toBeGreaterThan(0)
    expect(relationships.some((relationship) => relationship.relationType === 'uses')).toBe(true)
  })

  it('applies capped graph boosts only when entity names match an item', () => {
    const boosted = graphExpansionBoost({
      id: 'item-1',
      layer: 'project_brain',
      content: 'Browser Operator owns checkout QA.',
      score: 0.5,
      citations: [],
      trustLevel: 'observed',
      tokenCost: 8,
    }, [{
      entityId: 'entity-1',
      entityType: 'agent',
      canonicalName: 'Browser Operator',
      relationshipCount: 4,
      confidence: 0.9,
    }])

    expect(boosted).toBeGreaterThan(0.5)
    expect(boosted).toBeLessThanOrEqual(0.58)
  })
})
