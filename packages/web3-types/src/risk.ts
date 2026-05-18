/**
 * Risk Assessment Types
 */

export interface RiskAssessment {
  /** Overall risk level */
  level: 'low' | 'medium' | 'high' | 'critical'
  /** Individual risk checks */
  checks: RiskCheck[]
  /** Portfolio concentration after this trade (% in single asset) */
  concentrationAfter?: number
  /** Daily exposure after this trade (% of daily limit used) */
  dailyExposureAfter?: number
  /** Stablecoin runway remaining in USD */
  stablecoinRunway?: number
}

export interface RiskCheck {
  name: string
  passed: boolean
  detail: string
}
