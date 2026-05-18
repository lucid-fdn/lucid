import type { LucidPackManifest } from '@contracts/lucid-pack'

export type Web3SimulationSection = 'summary' | 'findings' | 'evidence' | 'risks' | 'next_actions'

export interface Web3SimulationEvidenceFixture {
  kind: string
  source: string
  value: string
}

export interface Web3SimulationSignalFixture {
  label: string
  value: string
  severity: 'info' | 'watch' | 'warning' | 'critical'
}

export interface Web3SimulationScenario {
  id: string
  templateKey: LucidPackManifest['key']
  title: string
  prompt: string
  signals: Web3SimulationSignalFixture[]
  evidence: Web3SimulationEvidenceFixture[]
  requiredCapabilities: string[]
  expectedTerms: string[]
  expectedSections: Web3SimulationSection[]
}

export const WEB3_SIMULATION_SCENARIOS: Web3SimulationScenario[] = [
  {
    id: 'whale-exchange-inflow',
    templateKey: 'web3-whale-watchtower',
    title: 'Whale exchange inflow alert',
    prompt: 'A watched wallet moved 2,100 ETH to Coinbase after a 19 day accumulation period. Explain whether this matters.',
    requiredCapabilities: [
      'web3.wallet.balance.read',
      'web3.wallet.history.read',
      'web3.price.read',
      'web3.token.risk.read',
    ],
    expectedTerms: ['2,100 ETH', 'Coinbase', 'watched wallet', 'risk context'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    signals: [
      { label: 'Movement', value: '2,100 ETH sent from 0xWhaleAlpha to Coinbase hot wallet', severity: 'warning' },
      { label: 'Cost basis proxy', value: '19 day accumulation window before transfer', severity: 'watch' },
      { label: 'Token risk', value: 'ETH liquidity healthy; no bridge exploit signals detected', severity: 'info' },
    ],
    evidence: [
      { kind: 'wallet_tx', source: 'manual-fixture:etherscan', value: 'tx:0xwhale-alpha-inflow coinbase_inflow=2100 ETH' },
      { kind: 'price', source: 'manual-fixture:coingecko', value: 'ETH 24h change -3.8%' },
      { kind: 'risk', source: 'manual-fixture:risk-engine', value: 'exchange inflow historically increases sell-pressure watchlist risk' },
    ],
  },
  {
    id: 'token-liquidity-holder-shift',
    templateKey: 'web3-token-war-room',
    title: 'Token liquidity and holder concentration shift',
    prompt: 'Review LUCID token after price rose 18%, DEX liquidity fell, and the top 10 holders now control 62%.',
    requiredCapabilities: [
      'web3.price.read',
      'web3.token.risk.read',
      'web3.token.holders.read',
      'web3.token.liquidity.read',
      'web3.trending.read',
    ],
    expectedTerms: ['18%', 'liquidity', 'top 10 holders', '62%'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    signals: [
      { label: 'Price', value: 'LUCID +18% over 24h', severity: 'watch' },
      { label: 'Liquidity', value: 'DEX liquidity -12% while volume expanded', severity: 'warning' },
      { label: 'Holder concentration', value: 'Top 10 holders control 62% of float', severity: 'warning' },
      { label: 'Narrative', value: 'Social velocity +44% on exchange-listing rumors', severity: 'watch' },
    ],
    evidence: [
      { kind: 'token_price', source: 'manual-fixture:birdeye', value: 'LUCID +18% 24h' },
      { kind: 'liquidity', source: 'manual-fixture:defined', value: 'primary pool liquidity -12%' },
      { kind: 'holders', source: 'manual-fixture:holders', value: 'top_10_holder_share=62%' },
    ],
  },
  {
    id: 'prediction-market-catalyst',
    templateKey: 'web3-prediction-market-alpha-desk',
    title: 'Prediction market catalyst move',
    prompt: 'A market moved from 41% to 57% after a regulator calendar update. Produce a watchlist brief, not a trade.',
    requiredCapabilities: [
      'web3.prediction.read',
      'web3.prediction.automation.manage',
    ],
    expectedTerms: ['41%', '57%', 'catalyst', 'review'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    signals: [
      { label: 'Probability move', value: 'ETH ETF approval market moved 41% -> 57%', severity: 'watch' },
      { label: 'Catalyst', value: 'Regulator added closed meeting to calendar', severity: 'info' },
      { label: 'Liquidity', value: '$920k 24h market volume, 3.1% spread', severity: 'watch' },
    ],
    evidence: [
      { kind: 'market_probability', source: 'manual-fixture:polymarket', value: 'market=eth-etf probability=57%' },
      { kind: 'catalyst', source: 'manual-fixture:calendar', value: 'regulator closed meeting listed for Friday' },
      { kind: 'liquidity', source: 'manual-fixture:market-depth', value: 'volume_24h=920000 spread=3.1%' },
    ],
  },
  {
    id: 'portfolio-concentration-review',
    templateKey: 'web3-portfolio-risk-agent',
    title: 'Portfolio concentration review',
    prompt: 'Review a wallet portfolio with 42% exposure to one token, 18% illiquid LP, and only 8% stablecoin buffer.',
    requiredCapabilities: [
      'web3.portfolio.read',
      'web3.wallet.balance.read',
      'web3.wallet.history.read',
      'web3.price.read',
      'web3.token.risk.read',
    ],
    expectedTerms: ['42%', '18%', '8%', 'concentration'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    signals: [
      { label: 'Concentration', value: '42% exposure to LUCID', severity: 'warning' },
      { label: 'Liquidity', value: '18% in illiquid LP position', severity: 'warning' },
      { label: 'Stablecoin buffer', value: '8% stablecoin allocation', severity: 'watch' },
    ],
    evidence: [
      { kind: 'portfolio', source: 'manual-fixture:wallet-snapshot', value: 'LUCID=42%, LP=18%, stables=8%' },
      { kind: 'drawdown', source: 'manual-fixture:risk-engine', value: '30d max drawdown estimate 27%' },
      { kind: 'wallet_history', source: 'manual-fixture:wallet-history', value: 'no recent de-risk transfers found' },
    ],
  },
  {
    id: 'smart-wallet-copy-draft',
    templateKey: 'web3-smart-wallet-copy-desk',
    title: 'Smart-wallet copy plan draft',
    prompt: 'A watched smart wallet bought a new token before a liquidity expansion. Draft a copy plan but do not execute.',
    requiredCapabilities: [
      'web3.wallet.history.read',
      'web3.price.read',
      'web3.token.risk.read',
      'web3.swap.execute',
    ],
    expectedTerms: ['copy plan', 'approval', 'do not execute', 'risk checks'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    signals: [
      { label: 'Smart-wallet action', value: '0xSmartLead accumulated 1.2% supply before liquidity expansion', severity: 'watch' },
      { label: 'Risk', value: 'Token has 14% owner wallet concentration', severity: 'warning' },
      { label: 'Execution', value: 'Execution must remain approval-only', severity: 'critical' },
    ],
    evidence: [
      { kind: 'wallet_tx', source: 'manual-fixture:etherscan', value: '0xSmartLead buy cluster detected' },
      { kind: 'token_risk', source: 'manual-fixture:risk-engine', value: 'owner_concentration=14%' },
      { kind: 'approval_policy', source: 'manifest:policy', value: 'Smart Wallet Execution Approval Policy blocks swaps by default' },
    ],
  },
  {
    id: 'daily-web3-operating-brief',
    templateKey: 'web3-intelligence-suite',
    title: 'Daily Web3 operating brief',
    prompt: 'Combine whale, token, portfolio, and prediction-market signals into one evidence-backed daily brief.',
    requiredCapabilities: [
      'web3.wallet.balance.read',
      'web3.wallet.history.read',
      'web3.portfolio.read',
      'web3.price.read',
      'web3.token.risk.read',
      'web3.token.holders.read',
      'web3.token.liquidity.read',
      'web3.trending.read',
      'web3.prediction.read',
      'web3.prediction.automation.manage',
    ],
    expectedTerms: ['operating brief', 'whale', 'token', 'prediction'],
    expectedSections: ['summary', 'findings', 'evidence', 'risks', 'next_actions'],
    signals: [
      { label: 'Whale', value: 'Two watched wallets moved funds to exchanges', severity: 'watch' },
      { label: 'Token', value: 'LUCID liquidity fell while holder concentration rose', severity: 'warning' },
      { label: 'Prediction', value: 'ETF market moved 41% -> 57%', severity: 'watch' },
      { label: 'Portfolio', value: 'Portfolio stablecoin buffer remains below policy target', severity: 'warning' },
    ],
    evidence: [
      { kind: 'wallet_tx', source: 'manual-fixture:etherscan', value: 'two exchange inflows detected' },
      { kind: 'token_health', source: 'manual-fixture:defined', value: 'liquidity down, concentration up' },
      { kind: 'prediction_market', source: 'manual-fixture:polymarket', value: 'ETH ETF market probability 57%' },
    ],
  },
]

export function getWeb3SimulationScenario(templateKey: string): Web3SimulationScenario {
  const scenario = WEB3_SIMULATION_SCENARIOS.find((item) => item.templateKey === templateKey)
  if (!scenario) throw new Error(`No Web3 simulation scenario registered for template ${templateKey}`)
  return scenario
}
