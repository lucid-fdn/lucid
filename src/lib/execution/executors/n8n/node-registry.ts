/**
 * n8n Node Registry
 * Maps our node types to n8n node types with parameter mappings
 * Version: 1.0.0
 */

import type { NodeRegistry } from '../../types';

// Egress allowlist for HTTP nodes
const EGRESS_ALLOWLIST = (process.env.EGRESS_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Validate URL against egress allowlist
 * Throws error if URL is blocked
 */
function validateEgressUrl(url: string): void {
  if (EGRESS_ALLOWLIST.length === 0) return; // Disabled

  try {
    const hostname = new URL(url).hostname;

    const allowed = EGRESS_ALLOWLIST.some((pattern) => {
      // Wildcard support: *.example.com
      if (pattern.startsWith('*.')) {
        return hostname.endsWith(pattern.slice(1));
      }
      // Exact match
      return hostname === pattern;
    });

    if (!allowed) {
      throw new Error(
        `Egress to ${hostname} blocked. Allowed domains: ${EGRESS_ALLOWLIST.join(', ')}`
      );
    }
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('blocked')) throw error;
    throw new Error(`Invalid URL: ${url}`);
  }
}

/**
 * Node Registry
 * 12 supported nodes (Function node explicitly disabled for security)
 */
export const NODE_REGISTRY: NodeRegistry = {
  // ==========================================================================
  // TRIGGERS
  // ==========================================================================

  'trigger.webhook': {
    n8nType: 'n8n-nodes-base.webhook',
    version: 1,
    defaultName: 'Webhook',
    mapParams: (d) => ({
      httpMethod: d.method || 'POST',
      path: d.path || '',
      responseMode: d.responseMode || 'onReceived',
      responseData: d.responseData || 'firstEntryJson',
      options: {
        rawBody: d.rawBody || false,
      },
    }),
    validate: (d) => {
      const errors: string[] = [];
      if (!d.path) errors.push('Webhook path is required');
      return errors;
    },
  },

  'trigger.cron': {
    n8nType: 'n8n-nodes-base.cron',
    version: 1,
    defaultName: 'Schedule Trigger',
    mapParams: (d) => ({
      triggerTimes: {
        item: [
          {
            mode: d.mode || 'everyMinute',
            hour: d.hour,
            minute: d.minute,
            dayOfMonth: d.dayOfMonth,
            weekday: d.weekday,
          },
        ],
      },
    }),
    validate: (d) => {
      const errors: string[] = [];
      if (!d.mode) errors.push('Schedule mode is required');
      return errors;
    },
  },

  // ==========================================================================
  // CONTROL FLOW
  // ==========================================================================

  'control.if': {
    n8nType: 'n8n-nodes-base.if',
    version: 2,
    defaultName: 'IF',
    mapParams: (d) => ({
      conditions: {
        conditions: ((d.conditions || []) as Record<string, unknown>[]).map((c) => ({
          id: c.id || crypto.randomUUID(),
          leftValue: c.leftValue || '',
          rightValue: c.rightValue || '',
          operation: c.operation || 'equal',
        })),
      },
      combineOperation: d.combineOperation || 'all',
    }),
    validate: (d) => {
      const errors: string[] = [];
      if (!d.conditions || !Array.isArray(d.conditions) || d.conditions.length === 0) {
        errors.push('At least one condition is required');
      }
      return errors;
    },
  },

  'control.switch': {
    n8nType: 'n8n-nodes-base.switch',
    version: 3,
    defaultName: 'Switch',
    mapParams: (d) => ({
      mode: d.mode || 'rules',
      rules: {
        rules: ((d.rules || []) as Record<string, unknown>[]).map((r) => ({
          outputKey: r.outputKey || '',
          conditions: {
            conditions: ((r.conditions || []) as Record<string, unknown>[]).map((c) => ({
              leftValue: c.leftValue || '',
              rightValue: c.rightValue || '',
              operation: c.operation || 'equal',
            })),
          },
        })),
      },
      fallbackOutput: d.fallbackOutput || 'extra',
    }),
    validate: (d) => {
      const errors: string[] = [];
      if (!d.rules || !Array.isArray(d.rules) || d.rules.length === 0) {
        errors.push('At least one rule is required');
      }
      return errors;
    },
  },

  'control.merge': {
    n8nType: 'n8n-nodes-base.merge',
    version: 2,
    defaultName: 'Merge',
    mapParams: (d) => ({
      mode: d.mode || 'append',
      mergeByFields: {
        values: ((d.joinFields as string[]) || []).map((field: string) => ({
          field1: field,
          field2: field,
        })),
      },
      options: {
        fuzzyCompare: d.fuzzyCompare || false,
      },
    }),
  },

  'control.split': {
    n8nType: 'n8n-nodes-base.splitInBatches',
    version: 3,
    defaultName: 'Split In Batches',
    mapParams: (d) => ({
      batchSize: d.batchSize || 10,
      options: {
        reset: d.reset || false,
      },
    }),
    validate: (d) => {
      const errors: string[] = [];
      if (d.batchSize && (d.batchSize as number) < 1) {
        errors.push('Batch size must be at least 1');
      }
      return errors;
    },
  },

  // ==========================================================================
  // DATA OPERATIONS
  // ==========================================================================

  'data.http': {
    n8nType: 'n8n-nodes-base.httpRequest',
    version: 4,
    defaultName: 'HTTP Request',
    mapParams: (d) => {
      // Validate egress
      if (d.url) {
        validateEgressUrl(d.url as string);
      }

      return {
        method: d.method || 'GET',
        url: d.url || '',
        authentication: d.authentication || 'none',
        sendQuery: d.queryParameters ? true : false,
        queryParameters: {
          parameters: ((d.queryParameters || []) as Record<string, unknown>[]).map((p) => ({
            name: p.name || '',
            value: p.value || '',
          })),
        },
        sendHeaders: d.headers ? true : false,
        headerParameters: {
          parameters: ((d.headers || []) as Record<string, unknown>[]).map((h) => ({
            name: h.name || '',
            value: h.value || '',
          })),
        },
        sendBody: d.body ? true : false,
        bodyParameters: d.body
          ? {
              parameters: Object.entries(d.body).map(([name, value]) => ({
                name,
                value,
              })),
            }
          : undefined,
        options: {
          timeout: d.timeout || 10000,
          redirect: {
            redirect: {
              followRedirects: d.followRedirects ?? true,
              maxRedirects: d.maxRedirects || 21,
            },
          },
        },
      };
    },
    mapCredentials: (d) => {
      if (!d.authentication || d.authentication === 'none') {
        return undefined;
      }

      // Credential reference (will be resolved by credential resolver)
      if (d.credentialAlias) {
        return {
          httpBasicAuth: {
            id: 'placeholder', // Will be resolved
            name: d.credentialAlias as string,
          },
        };
      }

      return undefined;
    },
    validate: (d) => {
      const errors: string[] = [];
      if (!d.url) errors.push('URL is required');
      try {
        if (d.url) validateEgressUrl(d.url as string);
      } catch (error: unknown) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      return errors;
    },
  },

  'data.set': {
    n8nType: 'n8n-nodes-base.set',
    version: 3,
    defaultName: 'Set',
    mapParams: (d) => ({
      mode: d.mode || 'manual',
      duplicateItem: d.duplicateItem || false,
      assignments: {
        assignments: ((d.assignments || []) as Record<string, unknown>[]).map((a) => ({
          id: a.id || crypto.randomUUID(),
          name: a.name || '',
          value: a.value || '',
          type: a.type || 'string',
        })),
      },
      options: {
        dotNotation: d.dotNotation ?? true,
      },
    }),
    validate: (d) => {
      const errors: string[] = [];
      if (!d.assignments || !Array.isArray(d.assignments) || d.assignments.length === 0) {
        errors.push('At least one assignment is required');
      }
      return errors;
    },
  },

  // ==========================================================================
  // AI/LLM
  // ==========================================================================

  'ai.chat': {
    n8nType: 'n8n-nodes-base.openAi',
    version: 1,
    defaultName: 'OpenAI',
    mapParams: (d) => ({
      resource: 'text',
      operation: 'message',
      model: d.model || 'gpt-3.5-turbo',
      messages: {
        messages: [
          {
            role: 'user',
            content: d.prompt || '',
          },
        ],
      },
      options: {
        temperature: d.temperature || 0.7,
        maxTokens: d.maxTokens || 1000,
        topP: d.topP || 1,
        frequencyPenalty: d.frequencyPenalty || 0,
        presencePenalty: d.presencePenalty || 0,
      },
    }),
    mapCredentials: (d) => {
      if (d.credentialAlias) {
        return {
          openAiApi: {
            id: 'placeholder', // Will be resolved
            name: d.credentialAlias as string,
          },
        };
      }
      return undefined;
    },
    validate: (d) => {
      const errors: string[] = [];
      if (!d.prompt) errors.push('Prompt is required');
      return errors;
    },
  },

  // ==========================================================================
  // INTEGRATIONS
  // ==========================================================================

  'integration.email': {
    n8nType: 'n8n-nodes-base.emailSend',
    version: 2,
    defaultName: 'Send Email',
    mapParams: (d) => ({
      fromEmail: d.fromEmail || '',
      toEmail: d.toEmail || '',
      subject: d.subject || '',
      emailType: d.emailType || 'text',
      text: d.text || '',
      html: d.html || '',
      options: {
        appendAttribution: d.appendAttribution ?? false,
        attachments: d.attachments || '',
        ccEmail: d.ccEmail || '',
        bccEmail: d.bccEmail || '',
        replyTo: d.replyTo || '',
      },
    }),
    mapCredentials: (d) => {
      if (d.credentialAlias) {
        return {
          smtp: {
            id: 'placeholder', // Will be resolved
            name: d.credentialAlias as string,
          },
        };
      }
      return undefined;
    },
    validate: (d) => {
      const errors: string[] = [];
      if (!d.toEmail) errors.push('To email is required');
      if (!d.subject) errors.push('Subject is required');
      if (d.emailType === 'text' && !d.text) {
        errors.push('Text content is required');
      }
      if (d.emailType === 'html' && !d.html) {
        errors.push('HTML content is required');
      }
      return errors;
    },
  },

  'integration.postgres': {
    n8nType: 'n8n-nodes-base.postgres',
    version: 2,
    defaultName: 'Postgres',
    mapParams: (d) => ({
      operation: d.operation || 'executeQuery',
      query: d.query || '',
      additionalFields: {
        mode: d.mode || 'list',
      },
    }),
    mapCredentials: (d) => {
      if (d.credentialAlias) {
        return {
          postgres: {
            id: 'placeholder', // Will be resolved
            name: d.credentialAlias as string,
          },
        };
      }
      return undefined;
    },
    validate: (d) => {
      const errors: string[] = [];
      if (!d.query) errors.push('SQL query is required');
      return errors;
    },
  },

  // ==========================================================================
  // DISABLED FOR SECURITY
  // ==========================================================================

  // 'data.function': DISABLED - No sandbox parameter exists in n8n
  // Use Code node only with manual admin approval in production
};

/**
 * Get node mapping by type
 */
export function getNodeMapping(nodeType: string) {
  const mapping = NODE_REGISTRY[nodeType];
  if (!mapping) {
    throw new Error(`Unsupported node type: ${nodeType}`);
  }
  return mapping;
}

/**
 * Validate node data against its mapping
 */
export function validateNode(nodeType: string, data: Record<string, unknown>): string[] {
  const mapping = getNodeMapping(nodeType);
  if (mapping.validate) {
    return mapping.validate(data);
  }
  return [];
}

/**
 * Get all supported node types
 */
export function getSupportedNodeTypes(): string[] {
  return Object.keys(NODE_REGISTRY);
}

/**
 * Check if node type is supported
 */
export function isNodeTypeSupported(nodeType: string): boolean {
  return nodeType in NODE_REGISTRY;
}

/**
 * Get node type version
 */
export function getNodeTypeVersion(nodeType: string): number {
  const mapping = getNodeMapping(nodeType);
  return mapping.version;
}
