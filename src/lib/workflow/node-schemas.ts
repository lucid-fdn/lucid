export interface NodeParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'textarea';
  label: string;
  placeholder?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: string[];
  description?: string;
}

export interface NodeSchema {
  parameters: NodeParameter[];
  description?: string;
}

export const NODE_SCHEMAS: Record<string, NodeSchema> = {
  trigger: {
    description: 'Trigger nodes start your workflow on a schedule or event',
    parameters: [
      {
        name: 'schedule',
        type: 'string',
        label: 'Schedule (Cron)',
        placeholder: '*/5 * * * *',
        required: true,
        description: 'Cron expression for scheduling',
      },
      {
        name: 'timezone',
        type: 'select',
        label: 'Timezone',
        options: ['UTC', 'America/New_York', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo'],
        default: 'UTC',
      },
      {
        name: 'enabled',
        type: 'boolean',
        label: 'Enabled',
        default: true,
        description: 'Enable or disable this trigger',
      }
    ]
  },
  
  action: {
    description: 'Action nodes perform operations like HTTP requests',
    parameters: [
      {
        name: 'url',
        type: 'string',
        label: 'URL',
        placeholder: 'https://api.example.com/endpoint',
        required: true,
        description: 'The URL to send the request to',
      },
      {
        name: 'method',
        type: 'select',
        label: 'Method',
        options: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        default: 'GET',
        description: 'HTTP method to use',
      },
      {
        name: 'headers',
        type: 'textarea',
        label: 'Headers (JSON)',
        placeholder: '{ "Content-Type": "application/json" }',
        description: 'HTTP headers as JSON object',
      },
      {
        name: 'body',
        type: 'textarea',
        label: 'Request Body',
        placeholder: '{ "key": "value" }',
        description: 'Request body for POST/PUT requests',
      },
      {
        name: 'timeout',
        type: 'number',
        label: 'Timeout (seconds)',
        default: 30,
        description: 'Request timeout in seconds',
      }
    ]
  },
  
  condition: {
    description: 'Condition nodes route workflow based on logic',
    parameters: [
      {
        name: 'field',
        type: 'string',
        label: 'Field',
        placeholder: 'data.status',
        required: true,
        description: 'The field to evaluate',
      },
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        options: ['equals', 'not_equals', 'contains', 'not_contains', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'],
        default: 'equals',
        description: 'Comparison operator',
      },
      {
        name: 'value',
        type: 'string',
        label: 'Value',
        placeholder: 'success',
        description: 'Value to compare against',
      },
      {
        name: 'caseSensitive',
        type: 'boolean',
        label: 'Case Sensitive',
        default: false,
        description: 'Make string comparisons case sensitive',
      }
    ]
  },
  
  transform: {
    description: 'Transform nodes modify data',
    parameters: [
      {
        name: 'operation',
        type: 'select',
        label: 'Operation',
        options: ['map', 'filter', 'reduce', 'sort', 'limit'],
        default: 'map',
        description: 'Type of transformation',
      },
      {
        name: 'expression',
        type: 'textarea',
        label: 'Expression',
        placeholder: 'item.value * 2',
        description: 'JavaScript expression to apply',
      },
      {
        name: 'limit',
        type: 'number',
        label: 'Limit',
        placeholder: '10',
        description: 'Limit number of items (for limit operation)',
      }
    ]
  }
};

export type NodeType = keyof typeof NODE_SCHEMAS;

// Helper to get schema for a node type
export function getNodeSchema(type: string): NodeSchema | undefined {
  return NODE_SCHEMAS[type as NodeType];
}

// Helper to get default config for a node type
export function getDefaultConfig(type: string): Record<string, unknown> {
  const schema = getNodeSchema(type);
  if (!schema) return {};

  const config: Record<string, unknown> = {};
  schema.parameters.forEach(param => {
    if (param.default !== undefined) {
      config[param.name] = param.default;
    }
  });
  return config;
}
