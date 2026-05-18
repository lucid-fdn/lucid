/**
 * AI Workflow Templates
 * Pre-built examples to help users get started
 */

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: 'monitoring' | 'alerts' | 'data' | 'social' | 'defi';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  tags: string[];
  icon: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'eth-gas-monitor',
    name: 'ETH Gas Price Monitor',
    description: 'Monitor Ethereum gas prices and get alerts when they spike',
    prompt: 'Check ETH gas prices every 10 minutes and send Slack alert if over 50 gwei',
    category: 'monitoring',
    difficulty: 'beginner',
    tags: ['ethereum', 'gas', 'monitoring', 'slack'],
    icon: '⛽',
  },
  {
    id: 'btc-price-alert',
    name: 'Bitcoin Price Alert',
    description: 'Get notified when BTC hits your target price',
    prompt: 'Monitor Bitcoin price every 5 minutes and email me if it crosses $50,000',
    category: 'alerts',
    difficulty: 'beginner',
    tags: ['bitcoin', 'price', 'email'],
    icon: '💰',
  },
  {
    id: 'defi-tvl-tracker',
    name: 'DeFi TVL Tracker',
    description: 'Track Total Value Locked across multiple protocols',
    prompt: 'Fetch TVL from Aave, Compound, and Uniswap daily, calculate total, store in database',
    category: 'defi',
    difficulty: 'intermediate',
    tags: ['defi', 'tvl', 'database'],
    icon: '📊',
  },
  {
    id: 'nft-floor-watch',
    name: 'NFT Floor Price Watcher',
    description: 'Monitor NFT collection floor prices for drops',
    prompt: 'Check BAYC floor price every hour on OpenSea and tweet if it drops 10%',
    category: 'monitoring',
    difficulty: 'intermediate',
    tags: ['nft', 'opensea', 'twitter'],
    icon: '🖼️',
  },
  {
    id: 'token-swap-alert',
    name: 'Token Swap Alert',
    description: 'Get alerts for large token swaps on DEXs',
    prompt: 'Monitor Uniswap for ETH-USDC swaps over $1M and send Discord notification',
    category: 'alerts',
    difficulty: 'advanced',
    tags: ['defi', 'uniswap', 'discord'],
    icon: '🔔',
  },
  {
    id: 'wallet-tracker',
    name: 'Whale Wallet Tracker',
    description: 'Track large wallet movements',
    prompt: 'Monitor top 100 ETH wallets for transfers over 1000 ETH and log to database',
    category: 'monitoring',
    difficulty: 'advanced',
    tags: ['ethereum', 'wallets', 'tracking'],
    icon: '🐋',
  },
  {
    id: 'social-sentiment',
    name: 'Social Sentiment Analysis',
    description: 'Analyze crypto sentiment from social media',
    prompt: 'Fetch Twitter mentions of Bitcoin hourly, analyze sentiment, and post summary to Telegram',
    category: 'social',
    difficulty: 'advanced',
    tags: ['twitter', 'sentiment', 'telegram'],
    icon: '📱',
  },
  {
    id: 'yield-optimizer',
    name: 'Yield Optimizer',
    description: 'Find best yield farming opportunities',
    prompt: 'Compare APY rates across Aave, Compound, Curve daily and email top 5 opportunities',
    category: 'defi',
    difficulty: 'intermediate',
    tags: ['defi', 'yield', 'email'],
    icon: '🌾',
  },
  {
    id: 'data-aggregator',
    name: 'Multi-Source Data Aggregator',
    description: 'Collect data from multiple APIs',
    prompt: 'Fetch data from CoinGecko, Etherscan, and TheGraph every hour, merge results, store in IPFS',
    category: 'data',
    difficulty: 'advanced',
    tags: ['api', 'data', 'ipfs'],
    icon: '📦',
  },
  {
    id: 'scheduled-report',
    name: 'Weekly Crypto Report',
    description: 'Automated weekly market reports',
    prompt: 'Every Monday at 9am, generate weekly crypto market report and email to team@company.com',
    category: 'data',
    difficulty: 'intermediate',
    tags: ['reports', 'email', 'scheduled'],
    icon: '📧',
  },
];

/**
 * Get templates by category
 */
export function getTemplatesByCategory(category: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.category === category);
}

/**
 * Get templates by difficulty
 */
export function getTemplatesByDifficulty(difficulty: string): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.filter(t => t.difficulty === difficulty);
}

/**
 * Search templates by keyword
 */
export function searchTemplates(query: string): WorkflowTemplate[] {
  const lowerQuery = query.toLowerCase();
  return WORKFLOW_TEMPLATES.filter(
    t =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some(tag => tag.includes(lowerQuery))
  );
}

/**
 * Get featured templates (top 3)
 */
export function getFeaturedTemplates(): WorkflowTemplate[] {
  return WORKFLOW_TEMPLATES.slice(0, 3);
}

/**
 * Get template by ID
 */
export function getTemplateById(id: string): WorkflowTemplate | undefined {
  return WORKFLOW_TEMPLATES.find(t => t.id === id);
}

/**
 * Get all categories
 */
export function getCategories(): Array<{ id: string; name: string; count: number }> {
  const categories = new Map<string, number>();
  
  WORKFLOW_TEMPLATES.forEach(template => {
    categories.set(template.category, (categories.get(template.category) || 0) + 1);
  });

  return Array.from(categories.entries()).map(([id, count]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    count,
  }));
}
