declare module '@lucid-fdn/plugins-embedded' {
  import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

  export const VERSION: string

  export function createAuditServer(): McpServer
  export function createBridgeServer(): McpServer
  export function createCompeteServer(): McpServer
  export function createFeedbackServer(): McpServer
  export function createHypeServer(): McpServer
  export function createInvoiceServer(): McpServer
  export function createMeetServer(): McpServer
  export function createMetricsServer(): McpServer
  export function createObservabilityServer(): McpServer
  export function createPredictServer(): McpServer
  export function createProposeServer(): McpServer
  export function createProspectServer(): McpServer
  export function createQuantumServer(): McpServer
  export function createRecruitServer(): McpServer
  export function createSeoServer(): McpServer
  export function createTaxServer(): McpServer
  export function createTradeServer(): McpServer
  export function createVeilleServer(): McpServer
  export function createVideoServer(): McpServer
}
