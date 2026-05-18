export type BrowserQaEvidence = {
  type: string
  title: string
  summary?: string
  uri?: string
  content?: Record<string, unknown>
}

export type BrowserQaFinding = {
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  body: string
  confidence: number
  fingerprint?: string
}

export type BrowserQaOutput = {
  summary: string
  findings: BrowserQaFinding[]
  evidence: BrowserQaEvidence[]
  risks: string[]
  next_actions: string[]
}
