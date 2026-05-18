/**
 * Expression Resolver
 * Resolves expressions like {{$vars.key}}, {{$json.field}}, {{$node["Name"].json.field}}
 */

export interface ExecutionContext {
  $vars: Record<string, unknown>;      // Workflow variables
  $json: unknown;                       // Current item data
  $node: Record<string, NodeData>;     // All node outputs
  $now: Date;                          // Current timestamp
  $env: Record<string, string>;        // Environment variables
}

export interface NodeData {
  json: unknown;      // Node output data
  binary?: unknown;   // Binary data (future)
}

/**
 * Resolve all expressions in an object
 */
export function resolveExpressions(
  input: unknown,
  context: ExecutionContext
): unknown {
  if (typeof input === 'string') {
    return resolveString(input, context);
  }

  if (Array.isArray(input)) {
    return input.map(item => resolveExpressions(item, context));
  }

  if (input !== null && typeof input === 'object') {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      resolved[key] = resolveExpressions(value, context);
    }
    return resolved;
  }

  return input;
}

/**
 * Resolve expressions in a string
 */
function resolveString(str: string, context: ExecutionContext): unknown {
  // Match {{expression}} patterns
  const expressionRegex = /\{\{([^}]+)\}\}/g;
  
  // Check if entire string is a single expression
  const singleExpressionMatch = str.match(/^\{\{([^}]+)\}\}$/);
  if (singleExpressionMatch) {
    // Return the actual value (not stringified)
    return evaluateExpression(singleExpressionMatch[1].trim(), context);
  }

  // Replace all expressions in string
  return str.replace(expressionRegex, (match, expression) => {
    const value = evaluateExpression(expression.trim(), context);
    return value !== undefined && value !== null ? String(value) : '';
  });
}

/**
 * Evaluate a single expression
 */
function evaluateExpression(expression: string, context: ExecutionContext): unknown {
  try {
    // Handle $vars.key
    if (expression.startsWith('$vars.')) {
      const key = expression.substring(6);
      return getNestedValue(context.$vars, key);
    }

    // Handle $json.field
    if (expression.startsWith('$json.')) {
      const path = expression.substring(6);
      return getNestedValue(context.$json, path);
    }

    // Handle $node["NodeName"].json.field
    if (expression.startsWith('$node[')) {
      const nodeMatch = expression.match(/\$node\["([^"]+)"\]\.json\.(.+)/);
      if (nodeMatch) {
        const [, nodeName, path] = nodeMatch;
        const nodeData = context.$node[nodeName];
        if (nodeData && nodeData.json) {
          return getNestedValue(nodeData.json, path);
        }
      }
      return undefined;
    }

    // Handle $now (with optional method calls)
    if (expression.startsWith('$now')) {
      if (expression === '$now') {
        return context.$now;
      }
      // Handle $now.toISOString(), etc.
      const nowMethodMatch = expression.match(/\$now\.(\w+)\(\)/);
      if (nowMethodMatch) {
        const method = nowMethodMatch[1] as keyof Date;
        const fn = context.$now[method];
        if (typeof fn === 'function') {
          return (fn as () => unknown).call(context.$now);
        }
      }
    }

    // Handle $env.VAR
    if (expression.startsWith('$env.')) {
      const key = expression.substring(5);
      return context.$env[key];
    }

    // Handle basic string methods (e.g., $json.name.toUpperCase())
    const methodMatch = expression.match(/^(\$[^.]+(?:\.[^.(]+)*)\.(\w+)\(\)$/);
    if (methodMatch) {
      const [, path, method] = methodMatch;
      const value = evaluateExpression(path, context);
      if (value !== undefined && value !== null) {
        const fn = (value as Record<string, unknown>)[method];
        if (typeof fn === 'function') {
          return (fn as () => unknown).call(value);
        }
      }
    }

    // Handle basic property access (e.g., $json.items.length)
    const propertyMatch = expression.match(/^(\$[^.]+(?:\.[^.]+)*)\.(\w+)$/);
    if (propertyMatch) {
      const [, path, property] = propertyMatch;
      const value = evaluateExpression(path, context);
      if (value !== undefined && value !== null) {
        return (value as Record<string, unknown>)[property];
      }
    }

    // Handle basic math operations (e.g., $json.price * 1.1)
    const mathMatch = expression.match(/^(.+)\s*([+\-*/])\s*(.+)$/);
    if (mathMatch) {
      const [, left, operator, right] = mathMatch;
      const leftValue = evaluateExpression(left.trim(), context);
      const rightValue = parseFloat(right.trim()) || evaluateExpression(right.trim(), context);

      if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        switch (operator) {
          case '+': return leftValue + rightValue;
          case '-': return leftValue - rightValue;
          case '*': return leftValue * rightValue;
          case '/': return rightValue !== 0 ? leftValue / rightValue : undefined;
        }
      }
    }

    console.warn(`[expressions] Unrecognized expression: ${expression}`);
    return undefined;
  } catch (error) {
    console.error(`[expressions] Error evaluating expression "${expression}":`, error);
    return undefined;
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  if (!obj || !path) return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Validate expression syntax
 */
export function validateExpression(expression: string): {
  valid: boolean;
  error?: string;
} {
  try {
    // Basic validation - check for valid expression patterns
    const validPatterns = [
      /^\$vars\.\w+(\.\w+)*$/,
      /^\$json\.\w+(\.\w+)*$/,
      /^\$node\[".+"\]\.json\.\w+(\.\w+)*$/,
      /^\$now(\.\w+\(\))?$/,
      /^\$env\.\w+$/,
    ];

    const hasValidPattern = validPatterns.some(pattern => pattern.test(expression));
    
    if (!hasValidPattern) {
      return {
        valid: false,
        error: 'Invalid expression syntax. Use $vars.key, $json.field, $node["Name"].json.field, $now, or $env.VAR'
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Test expression with sample data
 */
export function testExpression(
  expression: string,
  sampleData: unknown
): {
  success: boolean;
  result?: unknown;
  error?: string;
} {
  try {
    const context: ExecutionContext = {
      $vars: {},
      $json: sampleData,
      $node: {},
      $now: new Date(),
      $env: {},
    };

    const result = evaluateExpression(expression, context);

    return {
      success: true,
      result
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Extract all expressions from a string or object
 */
export function extractExpressions(input: unknown): string[] {
  const expressions: string[] = [];

  function extract(value: unknown) {
    if (typeof value === 'string') {
      const matches = value.match(/\{\{([^}]+)\}\}/g);
      if (matches) {
        matches.forEach(match => {
          const expr = match.slice(2, -2).trim();
          if (!expressions.includes(expr)) {
            expressions.push(expr);
          }
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach(item => extract(item));
    } else if (value !== null && typeof value === 'object') {
      Object.values(value).forEach(v => extract(v));
    }
  }

  extract(input);
  return expressions;
}
