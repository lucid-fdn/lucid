# n8n API De-Branding Guide for Backend Developers

## Overview

This guide provides complete instructions for removing n8n branding from API responses in your Lucid-L2 backend service. This allows you to white-label the workflow automation functionality while using n8n's powerful engine under the hood.

**Target:** Backend developers working with Node.js/Express services that proxy n8n APIs  
**Scope:** API response transformation, header modification, and branding removal  
**Time:** 2-4 hours implementation

---

## Architecture Overview

```
Client (LucidMerged Frontend)
    ↓ HTTP Request
Lucid-L2 Backend (Port 3001)
    ↓ Transform Request
n8n Instance (Port 5678)
    ↓ Process & Respond
n8n Response (branded)
    ↑ Transform Response
Lucid-L2 Backend
    ↑ Clean Response
Client (receives de-branded data)
```

---

## Implementation Strategy

### Approach: Response Transformation Middleware

Create a middleware layer that:
1. Intercepts all n8n API responses
2. Removes/replaces branding elements
3. Transforms field names and values
4. Cleans up headers
5. Returns sanitized response to client

---

## Step 1: Create Response Transformer Module

### File: `src/middleware/n8n-transformer.js` (or `.ts`)

```javascript
/**
 * n8n Response Transformer
 * Removes n8n branding from API responses
 */

class N8nResponseTransformer {
  constructor(config = {}) {
    this.brandName = config.brandName || 'Lucid';
    this.instancePrefix = config.instancePrefix || 'lucid';
    this.iconBaseUrl = config.iconBaseUrl || '/icons';
  }

  /**
   * Main transformation method
   * @param {Object} response - n8n API response
   * @param {String} endpoint - API endpoint path
   * @returns {Object} - Transformed response
   */
  transform(response, endpoint) {
    if (!response) return response;

    // Clone to avoid mutating original
    const transformed = JSON.parse(JSON.stringify(response));

    // Apply transformations based on endpoint
    if (endpoint.includes('/nodes')) {
      return this.transformNodesResponse(transformed);
    } else if (endpoint.includes('/workflow')) {
      return this.transformWorkflowResponse(transformed);
    } else if (endpoint.includes('/execution')) {
      return this.transformExecutionResponse(transformed);
    } else if (endpoint.includes('/credential')) {
      return this.transformCredentialResponse(transformed);
    } else {
      return this.transformGenericResponse(transformed);
    }
  }

  /**
   * Transform /api/flow/nodes endpoint
   */
  transformNodesResponse(response) {
    if (response.nodes && Array.isArray(response.nodes)) {
      response.nodes = response.nodes.map(node => this.transformNode(node));
    }

    // Update metadata
    if (response.message) {
      response.message = response.message.replace(/n8n/gi, this.brandName);
    }

    if (response.source) {
      response.source = response.source.replace(/n8n/gi, this.instancePrefix);
    }

    return response;
  }

  /**
   * Transform individual node definition
   */
  transformNode(node) {
    // Transform icon URLs to your CDN/static files
    if (node.iconUrl) {
      if (typeof node.iconUrl === 'string') {
        node.iconUrl = this.transformIconUrl(node.iconUrl);
      } else if (typeof node.iconUrl === 'object') {
        if (node.iconUrl.light) {
          node.iconUrl.light = this.transformIconUrl(node.iconUrl.light);
        }
        if (node.iconUrl.dark) {
          node.iconUrl.dark = this.transformIconUrl(node.iconUrl.dark);
        }
      }
    }

    // Transform documentation URLs
    if (node.codex?.resources) {
      if (node.codex.resources.primaryDocumentation) {
        node.codex.resources.primaryDocumentation = 
          node.codex.resources.primaryDocumentation.map(doc => ({
            url: this.transformDocUrl(doc.url)
          }));
      }
      if (node.codex.resources.credentialDocumentation) {
        node.codex.resources.credentialDocumentation = 
          node.codex.resources.credentialDocumentation.map(doc => ({
            url: this.transformDocUrl(doc.url)
          }));
      }
    }

    // Transform descriptions containing "n8n"
    if (node.description) {
      node.description = node.description.replace(/n8n/gi, this.brandName);
    }

    // Transform display names if they contain "n8n"
    if (node.displayName && node.displayName.toLowerCase().includes('n8n')) {
      node.displayName = node.displayName.replace(/n8n/gi, this.brandName);
    }

    return node;
  }

  /**
   * Transform icon URLs
   */
  transformIconUrl(url) {
    if (!url) return url;

    // Option 1: Proxy to your own CDN
    if (url.startsWith('icons/')) {
      return `${this.iconBaseUrl}/${url.replace('icons/', '')}`;
    }

    // Option 2: Keep as is but serve from your domain
    return url;
  }

  /**
   * Transform documentation URLs
   */
  transformDocUrl(url) {
    if (!url) return url;

    // Option 1: Point to your own docs
    if (url.includes('docs.n8n.io')) {
      return url.replace('docs.n8n.io', 'docs.yourdomain.com');
    }

    // Option 2: Remove docs links entirely
    // return null;

    // Option 3: Keep as is (link to n8n docs)
    return url;
  }

  /**
   * Transform workflow responses
   */
  transformWorkflowResponse(response) {
    // Remove n8n metadata
    if (response.meta) {
      delete response.meta.instanceId;
      delete response.meta.versionCli;
    }

    // Transform workflow data
    if (response.data) {
      if (Array.isArray(response.data)) {
        response.data = response.data.map(wf => this.cleanWorkflow(wf));
      } else {
        response.data = this.cleanWorkflow(response.data);
      }
    }

    return response;
  }

  /**
   * Transform execution responses
   */
  transformExecutionResponse(response) {
    // Remove n8n-specific execution metadata
    if (response.data) {
      if (Array.isArray(response.data)) {
        response.data = response.data.map(exec => this.cleanExecution(exec));
      } else {
        response.data = this.cleanExecution(response.data);
      }
    }

    return response;
  }

  /**
   * Transform credential responses
   */
  transformCredentialResponse(response) {
    if (response.data) {
      // Remove n8n credential type references
      if (Array.isArray(response.data)) {
        response.data = response.data.map(cred => this.cleanCredential(cred));
      } else {
        response.data = this.cleanCredential(response.data);
      }
    }

    return response;
  }

  /**
   * Transform generic responses
   */
  transformGenericResponse(response) {
    // Recursively clean all string values
    return this.deepClean(response);
  }

  /**
   * Clean workflow object
   */
  cleanWorkflow(workflow) {
    if (!workflow) return workflow;

    // Remove n8n references in name/description
    if (workflow.name) {
      workflow.name = workflow.name.replace(/n8n/gi, this.brandName);
    }
    if (workflow.description) {
      workflow.description = workflow.description.replace(/n8n/gi, this.brandName);
    }

    // Remove n8n metadata fields
    delete workflow.n8nVersion;
    delete workflow.n8nInstanceId;

    return workflow;
  }

  /**
   * Clean execution object
   */
  cleanExecution(execution) {
    if (!execution) return execution;

    // Remove n8n version info
    delete execution.n8nVersion;
    
    // Clean error messages
    if (execution.error) {
      execution.error = this.cleanErrorMessage(execution.error);
    }

    return execution;
  }

  /**
   * Clean credential object
   */
  cleanCredential(credential) {
    if (!credential) return credential;

    // Remove n8n references in credential names
    if (credential.name) {
      credential.name = credential.name.replace(/n8n/gi, this.brandName);
    }

    return credential;
  }

  /**
   * Clean error messages
   */
  cleanErrorMessage(error) {
    if (typeof error === 'string') {
      return error.replace(/n8n/gi, this.brandName);
    }
    if (error.message) {
      error.message = error.message.replace(/n8n/gi, this.brandName);
    }
    return error;
  }

  /**
   * Deep clean object recursively
   */
  deepClean(obj) {
    if (typeof obj === 'string') {
      return obj.replace(/n8n/gi, this.brandName);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClean(item));
    }

    if (obj && typeof obj === 'object') {
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        // Transform key if it contains n8n
        const cleanKey = key.replace(/n8n/gi, this.instancePrefix);
        cleaned[cleanKey] = this.deepClean(value);
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * Transform response headers
   */
  transformHeaders(headers) {
    const transformed = { ...headers };

    // Remove n8n server headers
    delete transformed['x-n8n-version'];
    delete transformed['x-n8n-instance-id'];
    
    // Replace server header
    if (transformed['server']) {
      transformed['server'] = transformed['server'].replace(/n8n/gi, this.brandName);
    }

    // Add your own headers
    transformed['x-powered-by'] = this.brandName;
    transformed['x-instance-id'] = this.instancePrefix + '-instance';

    return transformed;
  }
}

module.exports = N8nResponseTransformer;
```

---

## Step 2: Create Express Middleware

### File: `src/middleware/debrand-n8n.js`

```javascript
const N8nResponseTransformer = require('./n8n-transformer');

/**
 * Express middleware to transform n8n responses
 */
function createDebrandMiddleware(config = {}) {
  const transformer = new N8nResponseTransformer(config);

  return function debrandN8nMiddleware(req, res, next) {
    // Store original methods
    const originalJson = res.json;
    const originalSend = res.send;

    // Override res.json
    res.json = function(data) {
      const transformed = transformer.transform(data, req.path);
      return originalJson.call(this, transformed);
    };

    // Override res.send
    res.send = function(data) {
      // Only transform JSON responses
      if (typeof data === 'object') {
        const transformed = transformer.transform(data, req.path);
        return originalSend.call(this, transformed);
      }
      return originalSend.call(this, data);
    };

    // Transform response headers
    const originalSetHeader = res.setHeader;
    res.setHeader = function(name, value) {
      const transformedHeaders = transformer.transformHeaders({ [name]: value });
      if (transformedHeaders[name] !== undefined) {
        return originalSetHeader.call(this, name, transformedHeaders[name]);
      }
      return originalSetHeader.call(this, name, value);
    };

    next();
  };
}

module.exports = createDebrandMiddleware;
```

---

## Step 3: Apply Middleware to Your Routes

### File: `src/server.js` or `src/app.js`

```javascript
const express = require('express');
const createDebrandMiddleware = require('./middleware/debrand-n8n');

const app = express();

// Configure de-branding
const debrandConfig = {
  brandName: 'Lucid',
  instancePrefix: 'lucid',
  iconBaseUrl: process.env.ICON_BASE_URL || '/api/icons'
};

// Apply to all routes that proxy n8n
app.use('/api/*', createDebrandMiddleware(debrandConfig));

// Or apply to specific routes only
app.use('/api/flow/*', createDebrandMiddleware(debrandConfig));
app.use('/api/workflows/*', createDebrandMiddleware(debrandConfig));
app.use('/api/executions/*', createDebrandMiddleware(debrandConfig));

// Your existing routes...
```

---

## Step 4: Proxy Configuration with Transformation

### Using http-proxy-middleware

```javascript
const { createProxyMiddleware } = require('http-proxy-middleware');
const N8nResponseTransformer = require('./middleware/n8n-transformer');

const transformer = new N8nResponseTransformer({
  brandName: 'Lucid',
  instancePrefix: 'lucid'
});

// Create proxy with response transformation
const n8nProxy = createProxyMiddleware({
  target: 'http://localhost:5678', // Your n8n instance
  changeOrigin: true,
  pathRewrite: {
    '^/api/flow': '/api/v1' // Rewrite paths if needed
  },
  
  onProxyRes: (proxyRes, req, res) => {
    // Intercept and modify response
    let body = '';
    
    proxyRes.on('data', (chunk) => {
      body += chunk;
    });
    
    proxyRes.on('end', () => {
      try {
        // Parse response
        const data = JSON.parse(body);
        
        // Transform it
        const transformed = transformer.transform(data, req.path);
        
        // Send transformed response
        res.json(transformed);
      } catch (err) {
        // Not JSON, send as is
        res.send(body);
      }
    });
  },
  
  onProxyReq: (proxyReq, req, res) => {
    // Transform request headers
    proxyReq.removeHeader('x-forwarded-for');
    proxyReq.setHeader('x-client', 'lucid-backend');
  }
});

// Apply proxy
app.use('/api/flow', n8nProxy);
```

---

## Step 5: Specific Endpoint Transformations

### Transform /api/flow/nodes Response

```javascript
/**
 * Specific transformer for nodes endpoint
 */
function transformNodesEndpoint(data) {
  return {
    success: data.success,
    count: data.count,
    totalAvailable: data.totalAvailable,
    nodes: data.nodes.map(node => ({
      ...node,
      // Replace icon URLs
      iconUrl: transformIconUrl(node.iconUrl),
      
      // Clean descriptions
      description: cleanText(node.description),
      displayName: cleanText(node.displayName),
      
      // Remove n8n from codex
      codex: node.codex ? {
        ...node.codex,
        resources: {
          primaryDocumentation: transformDocs(node.codex.resources?.primaryDocumentation),
          credentialDocumentation: transformDocs(node.codex.resources?.credentialDocumentation)
        }
      } : undefined
    })),
    message: cleanText(data.message || ''),
    source: 'lucid-export' // Replace n8n source
  };
}

function transformIconUrl(iconUrl) {
  if (!iconUrl) return iconUrl;
  
  if (typeof iconUrl === 'string') {
    // Rewrite to your icon server
    return iconUrl.replace(
      'icons/n8n-nodes-base/',
      '/api/icons/nodes/'
    ).replace(
      'icons/@n8n/n8n-nodes-langchain/',
      '/api/icons/ai/'
    );
  }
  
  if (typeof iconUrl === 'object') {
    return {
      light: transformIconUrl(iconUrl.light),
      dark: transformIconUrl(iconUrl.dark)
    };
  }
  
  return iconUrl;
}

function transformDocs(docs) {
  if (!docs || !Array.isArray(docs)) return docs;
  
  return docs.map(doc => {
    if (!doc.url) return doc;
    
    // Option 1: Point to your docs
    const newUrl = doc.url
      .replace('docs.n8n.io', 'docs.yourdomain.com')
      .replace('/n8n-nodes-base.', '/lucid-nodes.');
    
    // Option 2: Remove docs entirely
    // return null;
    
    return { url: newUrl };
  }).filter(Boolean);
}

function cleanText(text) {
  if (!text) return text;
  return text.replace(/n8n/gi, 'Lucid');
}
```

### Transform /api/workflows Response

```javascript
function transformWorkflowsEndpoint(data) {
  const cleanWorkflow = (wf) => ({
    ...wf,
    name: cleanText(wf.name),
    description: cleanText(wf.description),
    // Remove n8n metadata
    meta: wf.meta ? {
      ...wf.meta,
      instanceId: undefined,
      versionCli: undefined,
      n8nVersion: undefined
    } : undefined
  });

  if (Array.isArray(data.data)) {
    return {
      ...data,
      data: data.data.map(cleanWorkflow)
    };
  }

  return {
    ...data,
    data: cleanWorkflow(data.data)
  };
}
```

### Transform /api/executions Response

```javascript
function transformExecutionsEndpoint(data) {
  const cleanExecution = (exec) => ({
    ...exec,
    // Clean error messages
    error: exec.error ? cleanText(JSON.stringify(exec.error)) : undefined,
    
    // Remove n8n version info
    n8nVersion: undefined,
    
    // Transform status messages
    statusMessage: exec.statusMessage ? cleanText(exec.statusMessage) : undefined
  });

  if (Array.isArray(data.data)) {
    return {
      ...data,
      data: data.data.map(cleanExecution)
    };
  }

  return {
    ...data,
    data: cleanExecution(data.data)
  };
}
```

---

## Step 6: Header Transformation

### Clean Response Headers

```javascript
/**
 * Middleware to clean response headers
 */
function cleanN8nHeaders(req, res, next) {
  const originalSetHeader = res.setHeader;
  
  res.setHeader = function(name, value) {
    const lowerName = name.toLowerCase();
    
    // Block n8n headers
    const blockedHeaders = [
      'x-n8n-version',
      'x-n8n-instance-id',
      'x-n8n-execution-id'
    ];
    
    if (blockedHeaders.includes(lowerName)) {
      return res; // Don't set these headers
    }
    
    // Transform server header
    if (lowerName === 'server' && typeof value === 'string') {
      value = value.replace(/n8n/gi, 'Lucid');
    }
    
    // Transform other headers containing n8n
    if (typeof value === 'string') {
      value = value.replace(/n8n/gi, 'Lucid');
    }
    
    return originalSetHeader.call(this, name, value);
  };
  
  next();
}

// Apply before other middleware
app.use(cleanN8nHeaders);
```

---

## Step 7: Error Response Transformation

### Clean Error Messages

```javascript
/**
 * Error handler that removes n8n branding
 */
function errorHandler(err, req, res, next) {
  // Clean error message
  let message = err.message || 'Internal server error';
  message = message.replace(/n8n/gi, 'Lucid');
  
  // Clean stack trace (in development only)
  let stack = err.stack;
  if (process.env.NODE_ENV !== 'production' && stack) {
    stack = stack.replace(/n8n/gi, 'Lucid');
  }
  
  // Send cleaned error
  res.status(err.status || 500).json({
    error: {
      message,
      code: err.code,
      stack: process.env.NODE_ENV !== 'production' ? stack : undefined
    }
  });
}

// Apply as last middleware
app.use(errorHandler);
```

---

## Step 8: Complete Express Server Example

### File: `src/server.js` (Full Implementation)

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const N8nResponseTransformer = require('./middleware/n8n-transformer');

const app = express();
const PORT = process.env.PORT || 3001;

// Configuration
const config = {
  brandName: 'Lucid',
  instancePrefix: 'lucid',
  iconBaseUrl: '/api/icons',
  n8nUrl: process.env.N8N_URL || 'http://localhost:5678'
};

// Initialize transformer
const transformer = new N8nResponseTransformer(config);

// Middleware
app.use(express.json());

/**
 * Custom proxy handler with transformation
 */
function createTransformingProxy(targetPath) {
  return async (req, res, next) => {
    try {
      // Forward request to n8n
      const n8nUrl = `${config.n8nUrl}${targetPath}${req.path.replace('/api/flow', '')}`;
      
      const response = await fetch(n8nUrl, {
        method: req.method,
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': process.env.N8N_API_KEY,
          ...req.headers
        },
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined
      });

      // Get response data
      const data = await response.json();
      
      // Transform response
      const transformed = transformer.transform(data, req.path);
      
      // Transform and set headers
      const transformedHeaders = transformer.transformHeaders(
        Object.fromEntries(response.headers.entries())
      );
      
      Object.entries(transformedHeaders).forEach(([key, value]) => {
        if (value !== undefined) {
          res.setHeader(key, value);
        }
      });
      
      // Send transformed response
      res.status(response.status).json(transformed);
      
    } catch (error) {
      next(error);
    }
  };
}

// Apply to specific routes
app.use('/api/flow/nodes', createTransformingProxy('/api/v1'));
app.use('/api/workflows', createTransformingProxy('/api/v1/workflows'));
app.use('/api/executions', createTransformingProxy('/api/v1/executions'));
app.use('/api/credentials', createTransformingProxy('/api/v1/credentials'));

// Health check (no n8n reference)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Lucid Workflow Engine',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Error handler
app.use((err, req, res, next) => {
  const message = (err.message || 'Internal server error').replace(/n8n/gi, 'Lucid');
  
  res.status(err.status || 500).json({
    error: {
      message,
      code: err.code || 'INTERNAL_ERROR',
      timestamp: new Date().toISOString()
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Lucid Backend running on port ${PORT}`);
  console.log(`Proxying to n8n at ${config.n8nUrl}`);
});
```

---

## Step 9: TypeScript Version (Recommended)

### File: `src/middleware/n8n-transformer.ts`

```typescript
interface TransformerConfig {
  brandName?: string;
  instancePrefix?: string;
  iconBaseUrl?: string;
}

interface NodeDefinition {
  name: string;
  displayName: string;
  description: string;
  iconUrl?: string | { light: string; dark: string };
  codex?: {
    resources?: {
      primaryDocumentation?: Array<{ url: string }>;
      credentialDocumentation?: Array<{ url: string }>;
    };
  };
  [key: string]: any;
}

interface NodesResponse {
  success: boolean;
  count: number;
  totalAvailable: number;
  nodes: NodeDefinition[];
  message?: string;
  source?: string;
}

export class N8nResponseTransformer {
  private brandName: string;
  private instancePrefix: string;
  private iconBaseUrl: string;

  constructor(config: TransformerConfig = {}) {
    this.brandName = config.brandName || 'Lucid';
    this.instancePrefix = config.instancePrefix || 'lucid';
    this.iconBaseUrl = config.iconBaseUrl || '/icons';
  }

  /**
   * Main transformation method
   */
  transform(response: any, endpoint: string): any {
    if (!response) return response;

    const transformed = JSON.parse(JSON.stringify(response));

    if (endpoint.includes('/nodes')) {
      return this.transformNodesResponse(transformed);
    } else if (endpoint.includes('/workflow')) {
      return this.transformWorkflowResponse(transformed);
    } else if (endpoint.includes('/execution')) {
      return this.transformExecutionResponse(transformed);
    }

    return this.transformGenericResponse(transformed);
  }

  /**
   * Transform nodes response
   */
  private transformNodesResponse(response: NodesResponse): NodesResponse {
    if (response.nodes) {
      response.nodes = response.nodes.map(node => this.transformNode(node));
    }

    if (response.message) {
      response.message = this.cleanText(response.message);
    }

    if (response.source) {
      response.source = `${this.instancePrefix}-export`;
    }

    return response;
  }

  /**
   * Transform single node
   */
  private transformNode(node: NodeDefinition): NodeDefinition {
    return {
      ...node,
      iconUrl: this.transformIconUrl(node.iconUrl),
      description: this.cleanText(node.description),
      displayName: this.cleanText(node.displayName),
      codex: node.codex ? {
        ...node.codex,
        resources: this.transformResources(node.codex.resources)
      } : undefined
    };
  }

  /**
   * Transform icon URL
   */
  private transformIconUrl(iconUrl: any): any {
    if (!iconUrl) return iconUrl;

    if (typeof iconUrl === 'string') {
      return iconUrl
        .replace('icons/n8n-nodes-base/', `${this.iconBaseUrl}/nodes/`)
        .replace('icons/@n8n/n8n-nodes-langchain/', `${this.iconBaseUrl}/ai/`);
    }

    if (typeof iconUrl === 'object') {
      return {
        light: this.transformIconUrl(iconUrl.light),
        dark: this.transformIconUrl(iconUrl.dark)
      };
    }

    return iconUrl;
  }

  /**
   * Transform documentation resources
   */
  private transformResources(resources: any): any {
    if (!resources) return resources;

    return {
      primaryDocumentation: this.transformDocs(resources.primaryDocumentation),
      credentialDocumentation: this.transformDocs(resources.credentialDocumentation)
    };
  }

  /**
   * Transform documentation URLs
   */
  private transformDocs(docs: any[]): any[] {
    if (!docs) return docs;

    return docs.map(doc => {
      if (!doc.url) return doc;
      
      // Option 1: Point to your docs
      return {
        url: doc.url
          .replace('docs.n8n.io', 'docs.lucid.foundation')
          .replace('/n8n-nodes-base.', '/lucid-nodes.')
      };
      
      // Option 2: Remove docs
      // return null;
    }).filter(Boolean);
  }

  /**
   * Clean text of n8n references
   */
  private cleanText(text: string): string {
    if (!text) return text;
    return text.replace(/n8n/gi, this.brandName);
  }

  /**
   * Transform generic response
   */
  private transformGenericResponse(response: any): any {
    return this.deepClean(response);
  }

  /**
   * Transform workflow response
   */
  private transformWorkflowResponse(response: any): any {
    // Implementation similar to JavaScript version
    return response;
  }

  /**
   * Transform execution response
   */
  private transformExecutionResponse(response: any): any {
    // Implementation similar to JavaScript version
    return response;
  }

  /**
   * Deep clean object recursively
   */
  private deepClean(obj: any): any {
    if (typeof obj === 'string') {
      return this.cleanText(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.deepClean(item));
    }

    if (obj && typeof obj === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanKey = key.replace(/n8n/gi, this.instancePrefix);
        cleaned[cleanKey] = this.deepClean(value);
      }
      return cleaned;
    }

    return obj;
  }

  /**
   * Transform headers
   */
  transformHeaders(headers: Record<string, any>): Record<string, any> {
    const transformed = { ...headers };

    // Remove n8n headers
    delete transformed['x-n8n-version'];
    delete transformed['x-n8n-instance-id'];
    delete transformed['x-n8n-execution-id'];

    // Replace server header
    if (transformed['server']) {
      transformed['server'] = this.cleanText(transformed['server']);
    }

    // Add custom headers
    transformed['x-powered-by'] = this.brandName;
    transformed['x-service'] = `${this.instancePrefix}-engine`;

    return transformed;
  }
}

export default N8nResponseTransformer;
```

---

## Step 10: Apply to Your Lucid-L2 API Routes

### Example: Transform in API Route Handler

```typescript
// src/routes/flow/nodes.ts
import { Request, Response, NextFunction } from 'express';
import N8nResponseTransformer from '../middleware/n8n-transformer';

const transformer = new N8nResponseTransformer({
  brandName: 'Lucid',
  instancePrefix: 'lucid',
  iconBaseUrl: '/api/icons'
});

export async function getNodes(req: Request, res: Response, next: NextFunction) {
  try {
    // Fetch from n8n
    const n8nResponse = await fetch('http://localhost:5678/api/v1/nodes/list', {
      headers: {
        'X-N8N-API-KEY': process.env.N8N_API_KEY as string
      }
    });

    const data = await n8nResponse.json();
    
    // Transform response
    const transformed = transformer.transform(data, '/nodes');
    
    // Send de-branded response
    res.json(transformed);
  } catch (error) {
    next(error);
  }
}
```

### Example: Direct Transformation in Existing Route

If you already have routes that fetch from n8n, just add transformation:

```typescript
// Before (with n8n branding)
app.get('/api/flow/nodes', async (req, res) => {
  const data = await fetchFromN8n('/api/v1/nodes/list');
  res.json(data); // Contains n8n branding
});

// After (de-branded)
app.get('/api/flow/nodes', async (req, res) => {
  const data = await fetchFromN8n('/api/v1/nodes/list');
  const transformed = transformer.transform(data, req.path);
  res.json(transformed); // Clean response
});
```

---

## Step 11: Icon Serving Strategy

You need to decide how to handle icon URLs from n8n.

### Option A: Proxy Icons Through Your Backend

```javascript
// Serve n8n icons through your domain
app.get('/api/icons/*', async (req, res) => {
  const iconPath = req.params[0];
  
  // Map to n8n icon path
  const n8nIconUrl = `http://localhost:5678/icons/${iconPath}`;
  
  try {
    const response = await fetch(n8nIconUrl);
    const buffer = await response.arrayBuffer();
    
    // Set appropriate content type
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    
    res.send(Buffer.from(buffer));
  } catch (error) {
    res.status(404).send('Icon not found');
  }
});
```

### Option B: Copy Icons to Your Static Files

```bash
# In Lucid-L2 project root
mkdir -p public/icons/nodes
mkdir -p public/icons/ai

# Copy icons from n8n installation
cp -r /path/to/n8n/packages/nodes-base/dist/nodes/*/icons/* public/icons/nodes/
cp -r /path/to/n8n/packages/@n8n/n8n-nodes-langchain/dist/nodes/*/icons/* public/icons/ai/
```

Then serve statically:
```javascript
app.use('/api/icons', express.static('public/icons'));
```

### Option C: Use CDN

Upload icons to your CDN and rewrite URLs:
```javascript
transformIconUrl(iconUrl) {
  return iconUrl
    .replace('icons/n8n-nodes-base/', 'https://cdn.yourdomain.com/icons/nodes/')
    .replace('icons/@n8n/n8n-nodes-langchain/', 'https://cdn.yourdomain.com/icons/ai/');
}
```

---

## Step 12: Environment Variables

### Add to .env

```env
# n8n Connection
N8N_URL=http://localhost:5678
N8N_API_KEY=your-n8n-api-key

# Branding Configuration
BRAND_NAME=Lucid
BRAND_PREFIX=lucid
ICON_BASE_URL=/api/icons
DOCS_BASE_URL=https://docs.lucid.foundation

# Feature Flags
ENABLE_N8N_DEBRANDING=true
TRANSFORM_ICON_URLS=true
TRANSFORM_DOC_URLS=true
REMOVE_N8N_METADATA=true
```

### Use in Configuration

```javascript
const config = {
  brandName: process.env.BRAND_NAME || 'Lucid',
  instancePrefix: process.env.BRAND_PREFIX || 'lucid',
  iconBaseUrl: process.env.ICON_BASE_URL || '/api/icons',
  docsBaseUrl: process.env.DOCS_BASE_URL || 'https://docs.lucid.foundation',
  
  // Feature flags
  enabled: process.env.ENABLE_N8N_DEBRANDING === 'true',
  transformIcons: process.env.TRANSFORM_ICON_URLS === 'true',
  transformDocs: process.env.TRANSFORM_DOC_URLS === 'true',
  removeMetadata: process.env.REMOVE_N8N_METADATA === 'true'
};
```

---

## Step 13: Testing the Implementation

### Test Cases

```javascript
// test/n8n-transformer.test.js
const N8nResponseTransformer = require('../src/middleware/n8n-transformer');

describe('N8nResponseTransformer', () => {
  let transformer;
  
  beforeEach(() => {
    transformer = new N8nResponseTransformer({
      brandName: 'Lucid',
      instancePrefix: 'lucid'
    });
  });

  test('should replace n8n in message', () => {
    const response = {
      message: 'Retrieved 847 of 847 n8n node types'
    };
    
    const result = transformer.transform(response, '/nodes');
    
    expect(result.message).toBe('Retrieved 847 of 847 Lucid node types');
  });

  test('should replace n8n in source', () => {
    const response = {
      source: 'n8n-cli-export'
    };
    
    const result = transformer.transform(response, '/nodes');
    
    expect(result.source).toBe('lucid-cli-export');
  });

  test('should transform icon URLs', () => {
    const node = {
      iconUrl: 'icons/n8n-nodes-base/dist/nodes/Slack/slack.svg'
    };
    
    const result = transformer.transformNode(node);
    
    expect(result.iconUrl).toBe('/icons/nodes/dist/nodes/Slack/slack.svg');
  });

  test('should transform documentation URLs', () => {
    const node = {
      codex: {
        resources: {
          primaryDocumentation: [{
            url: 'https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.slack/'
          }]
        }
      }
    };
    
    const result = transformer.transformNode(node);
    
    expect(result.codex.resources.primaryDocumentation[0].url)
      .toContain('docs.yourdomain.com');
  });

  test('should remove n8n headers', () => {
    const headers = {
      'x-n8n-version': '1.0.0',
      'x-n8n-instance-id': '123',
      'content-type': 'application/json'
    };
    
    const result = transformer.transformHeaders(headers);
    
    expect(result['x-n8n-version']).toBeUndefined();
    expect(result['x-n8n-instance-id']).toBeUndefined();
    expect(result['content-type']).toBe('application/json');
  });
});
```

### Manual Testing

```bash
# Test nodes endpoint
curl http://localhost:3001/api/flow/nodes | jq '.message'
# Should return: "Retrieved 847 of 847 Lucid node types"

# Check headers
curl -I http://localhost:3001/api/flow/nodes
# Should NOT see: x-n8n-version, x-n8n-instance-id

# Test icon URL transformation
curl http://localhost:3001/api/flow/nodes | jq '.nodes[0].iconUrl'
# Should return: "/api/icons/nodes/..." not "icons/n8n-nodes-base/..."
```

---

## Step 14: Performance Optimization

### Add Caching to Reduce Transformation Overhead

```javascript
const NodeCache = require('node-cache');

class CachedN8nTransformer extends N8nResponseTransformer {
  constructor(config) {
    super(config);
    this.cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache
  }

  transform(response, endpoint) {
    // Create cache key
    const cacheKey = `${endpoint}:${JSON.stringify(response).substring(0, 100)}`;
    
    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    // Transform
    const transformed = super.transform(response, endpoint);
    
    // Cache result
    this.cache.set(cacheKey, transformed);
    
    return transformed;
  }
}

module.exports = CachedN8nTransformer;
```

### Use Streaming for Large Responses

```javascript
const { Transform } = require('stream');

class N8nTransformStream extends Transform {
  constructor(transformer, endpoint) {
    super();
    this.transformer = transformer;
    this.endpoint = endpoint;
    this.buffer = '';
  }

  _transform(chunk, encoding, callback) {
    this.buffer += chunk.toString();
    callback();
  }

  _flush(callback) {
    try {
      const data = JSON.parse(this.buffer);
      const transformed = this.transformer.transform(data, this.endpoint);
      this.push(JSON.stringify(transformed));
      callback();
    } catch (err) {
      callback(err);
    }
  }
}

// Use in route
app.get('/api/flow/nodes', (req, res) => {
  const n8nStream = getN8nStream('/api/v1/nodes/list');
  const transformStream = new N8nTransformStream(transformer, req.path);
  
  n8nStream
    .pipe(transformStream)
    .pipe(res);
});
```

---

## Step 15: Advanced Transformations

### Remove Specific Node Names

```javascript
/**
 * Filter out nodes with n8n in the name that can't be renamed
 */
transformNodesResponse(response) {
  if (response.nodes) {
    response.nodes = response.nodes
      .filter(node => {
        // Remove n8n training nodes
        if (node.name.includes('n8nTraining')) return false;
        
        // Remove n8n trigger node
        if (node.name === 'n8n-nodes-base.n8nTrigger') return false;
        
        return true;
      })
      .map(node => this.transformNode(node));
      
    // Update count
    response.count = response.nodes.length;
    response.totalAvailable = response.nodes.length;
  }

  return response;
}
```

### Transform Node Names

```javascript
/**
 * Rename node identifiers
 */
transformNode(node) {
  // Transform node name/ID
  if (node.name) {
    node.name = node.name
      .replace('n8n-nodes-base.n8n', 'lucid-nodes-base.lucid')
      .replace('@n8n/n8n-nodes-langchain', '@lucid/lucid-nodes-ai');
  }
  
  // Rest of transformations...
  return node;
}
```

### Custom Node Descriptions

```javascript
/**
 * Replace entire descriptions for key nodes
 */
const customDescriptions = {
  'n8n-nodes-base.webhook': 'Receive HTTP webhooks in your Lucid workflows',
  'n8n-nodes-base.httpRequest': 'Make HTTP requests to any API',
  'n8n-nodes-base.code': 'Execute custom JavaScript or Python code'
};

transformNode(node) {
  // Use custom description if available
  if (customDescriptions[node.name]) {
    node.description = customDescriptions[node.name];
  } else {
    node.description = this.cleanText(node.description);
  }
  
  return node;
}
```

---

## Step 16: Deployment Instructions

### For Backend Developer

**1. Install Dependencies**
```bash
npm install express http-proxy-middleware node-cache
# or
yarn add express http-proxy-middleware node-cache
```

**2. Create Files**
```
src/
├── middleware/
│   ├── n8n-transformer.js (or .ts)
│   └── debrand-n8n.js (or .ts)
├── routes/
│   └── flow/
│       ├── nodes.js
│       ├── workflows.js
│       └── executions.js
└── server.js (or app.js)
```

**3. Update Server Configuration**
```javascript
// In your main server file
const createDebrandMiddleware = require('./middleware/debrand-n8n');

// Apply globally or to specific routes
app.use('/api/flow/*', createDebrandMiddleware({
  brandName: 'Lucid',
  instancePrefix: 'lucid'
}));
```

**4. Test Locally**
```bash
# Start n8n (if not already running)
docker-compose up n8n

# Start your backend
npm run dev

# Test endpoint
curl http://localhost:3001/api/flow/nodes | grep -i "n8n"
# Should return NO matches
```

**5. Verify Transformations**
```bash
# Check nodes endpoint
curl http://localhost:3001/api/flow/nodes | jq '.message'
# Expected: "Retrieved 847 of 847 Lucid node types"

# Check source field
curl http://localhost:3001/api/flow/nodes | jq '.source'
# Expected: "lucid-export"

# Check icon URLs
curl http://localhost:3001/api/flow/nodes | jq '.nodes[0].iconUrl'
# Expected: "/api/icons/..." not "icons/n8n-..."

# Check headers
curl -I http://localhost:3001/api/flow/nodes | grep -i n8n
# Expected: No output (no n8n headers)
```

---

## Step 17: Production Checklist

### Before Deploying

- [ ] Test all API endpoints with transformation
- [ ] Verify no "n8n" text in responses
- [ ] Check response headers are clean
- [ ] Test error responses
- [ ] Verify icon URLs work
- [ ] Test documentation links (if keeping them)
- [ ] Performance test with large responses
- [ ] Add logging for transformation errors
- [ ] Set up monitoring for failed transformations
- [ ] Document any n8n references that can't be removed

### Performance Considerations

```javascript
// Enable compression for large responses
const compression = require('compression');
app.use(compression());

// Add response caching
const apicache = require('apicache');
const cache = apicache.middleware;

app.get('/api/flow/nodes', 
  cache('1 hour'), // Cache transformed response
  createTransformingProxy('/api/v1')
);
```

---

## Step 18: Monitoring & Logging

### Add Transformation Logging

```javascript
class N8nResponseTransformer {
  constructor(config = {}) {
    this.brandName = config.brandName || 'Lucid';
    this.instancePrefix = config.instancePrefix || 'lucid';
    this.iconBaseUrl = config.iconBaseUrl || '/icons';
    this.logger = config.logger || console;
  }

  transform(response, endpoint) {
    const startTime = Date.now();
    
    try {
      const transformed = this._performTransform(response, endpoint);
      
      const duration = Date.now() - startTime;
      this.logger.info('Response transformed', {
        endpoint,
        duration,
        itemsTransformed: this._countItems(response)
      });
      
      return transformed;
    } catch (error) {
      this.logger.error('Transformation failed', {
        endpoint,
        error: error.message
      });
      throw error;
    }
  }

  _countItems(response) {
    if (response.nodes) return response.nodes.length;
    if (response.data?.length) return response.data.length;
    return 1;
  }
}
```

### Monitor Transformation Performance

```javascript
// Add metrics
const metrics = {
  transformations: 0,
  failures: 0,
  averageTime: 0
};

app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    metrics.transformations++;
    metrics.averageTime = 
      (metrics.averageTime * (metrics.transformations - 1) + duration) / 
      metrics.transformations;
  });
  
  next();
});

// Metrics endpoint
app.get('/api/metrics', (req, res) => {
  res.json(metrics);
});
```

---

## Step 19: Handling Edge Cases

### Deal with Binary Responses

```javascript
function debrandN8nMiddleware(req, res, next) {
  const originalSend = res.send;

  res.send = function(data) {
    // Check if response is JSON
    const contentType = res.getHeader('content-type');
    
    if (contentType && contentType.includes('application/json')) {
      try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        const transformed = transformer.transform(parsed, req.path);
        return originalSend.call(this, JSON.stringify(transformed));
      } catch (err) {
        // Not valid JSON, send as is
        return originalSend.call(this, data);
      }
    }
    
    // Binary or non-JSON response, don't transform
    return originalSend.call(this, data);
  };

  next();
}
```

### Handle Streaming Responses

```javascript
app.get('/api/executions/:id/stream', (req, res) => {
  const n8nStream = getN8nExecutionStream(req.params.id);
  
  n8nStream.on('data', (chunk) => {
    // Transform each chunk
    const transformed = transformer.transform(
      JSON.parse(chunk.toString()), 
      req.path
    );
    res.write(JSON.stringify(transformed) + '\n');
  });
  
  n8nStream.on('end', () => {
    res.end();
  });
});
```

---

## Step 20: Quick Start Implementation

### Minimal Implementation (5 minutes)

If you just need basic de-branding quickly:

```javascript
// Simple middleware - add to your server.js
app.use('/api/*', (req, res, next) => {
  const originalJson = res.json;
  
  res.json = function(data) {
    // Simple find/replace for n8n
    const str = JSON.stringify(data);
    const cleaned = str.replace(/n8n/gi, 'Lucid');
    return originalJson.call(this, JSON.parse(cleaned));
  };
  
  next();
});
```

**Pros:** Quick, simple, works immediately  
**Cons:** Less control, may transform unintended strings

---

## Troubleshooting

### Issue: Icons Not Loading

**Cause:** Icon URLs point to n8n paths that don't exist in your backend

**Solutions:**
1. Set up icon proxy endpoint (Step 11, Option A)
2. Copy icons to your static files (Step 11, Option B)
3. Use CDN (Step 11, Option C)

### Issue: Transformation Breaking JSON

**Cause:** Over-aggressive string replacement

**Solution:**
```javascript
// Be more specific with replacements
cleanText(text) {
  // Only replace standalone "n8n"
  return text.replace(/\bn8n\b/gi, this.brandName);
}
```

### Issue: Performance Degradation

**Cause:** Transforming large responses on every request

**Solutions:**
1. Add caching (Step 14)
2. Use streaming (Step 14)
3. Transform only necessary fields

### Issue: Some n8n References Remain

**Cause:** Nested objects or special fields

**Solution:**
```javascript
// Add more thorough deep cleaning
deepClean(obj, depth = 0) {
  // Prevent infinite recursion
  if (depth > 10) return obj;
  
  // ... rest of deepClean implementation with depth tracking
}
```

---

## License Considerations

### n8n Fair-Code License

**What you CAN do:**
- ✅ Use n8n for internal tools
- ✅ Modify API responses for your application
- ✅ Remove branding from API responses
- ✅ Self-host with customizations

**What you CANNOT do:**
- ❌ Resell n8n as a competing product
- ❌ Remove n8n attribution if distributing modified source
- ❌ Use n8n trademark without permission

**Safe Practice:**
- Transform API responses for your application's use
- Keep n8n running as backend service
- Don't claim you built the workflow engine
- Consider n8n Enterprise license for commercial use without restrictions

---

## Summary

### What Gets Transformed

✅ **API Response Bodies**
- Node descriptions and names
- Workflow metadata
- Execution results
- Error messages

✅ **Response Headers**
- Remove `x-n8n-*` headers
- Replace server identification
- Add custom branding headers

✅ **URLs**
- Icon paths
- Documentation links
- API endpoints (in responses)

✅ **Metadata**
- Version strings
- Instance IDs
- Source identifiers

### What Stays Unchanged

🔒 **n8n Core Functionality**
- Workflow execution engine
- Node implementations
- Database structure

🔒 **Request Format**
- How you call n8n APIs
- Authentication method
- Request parameters

---

## Quick Reference

### Essential Files to Create

1. `src/middleware/n8n-transformer.js` - Core transformation logic
2. `src/middleware/debrand-n8n.js` - Express middleware wrapper
3. Update `src/server.js` - Apply middleware to routes

### Essential Configuration

```env
BRAND_NAME=Lucid
BRAND_PREFIX=lucid
ENABLE_N8N_DEBRANDING=true
```

### Essential Code

```javascript
// 1. Initialize
const transformer = new N8nResponseTransformer({ brandName: 'Lucid' });

// 2. Apply
app.use('/api/*', debrandMiddleware);

// 3. Transform
const clean = transformer.transform(n8nResponse, req.path);
```

---

## Next Steps

After implementing:

1. **Test thoroughly** - All endpoints, all response types
2. **Monitor performance** - Add metrics and logging
3. **Document changes** - Update your API documentation
4. **Set up monitoring** - Track transformation errors
5. **Consider caching** - Improve response times
6. **Plan icon strategy** - Decide how to serve icons
7. **Update frontend** - Adjust icon URLs in your React app

---

## Support

If you encounter issues:

1. Check transformer logs for errors
2. Verify n8n connection is working
3. Test with simple endpoint first
4. Use provided test cases
5. Check for JSON parsing errors
6. Verify middleware order in Express

**Pro Tip:** Start with the minimal implementation (Step 20) to verify it works, then gradually add more sophisticated transformations.

---

**Document Version:** 1.0  
**Last Updated:** January 21, 2025  
**Implementation Time:** 2-4 hours  
**Difficulty:** Intermediate
