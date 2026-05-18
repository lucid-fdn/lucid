import { AgentCatalog, AgentAction, AgentUIConfig } from '@/types/agent';

// Combined agent type that includes both UI and API fields
export interface AIAgent extends AgentCatalog {
  image: string;
  role: string;
  rating: number;
  blockchain: string;
  lore: string;
  tokenAddress: string;
  marketCap: number;
  TVL: number;
  tokenPrice: number;
  createdAt: string;
  createdBy: string;
  ui: AgentUIConfig;
  actions: AgentAction[];
  frequentQuestions: string[];
}

// Available agents data with UI configurations
export const availableAgents: AIAgent[] = [
  {
    id: "code-master",
    name: "Code Master",
    image: "/logos/icon/codemaster.png",
    description: "Expert in programming and software development",
    role: "Code Expert",
    rating: 4.8,
    blockchain: "Avalanche",
    lore: "A seasoned developer with expertise in multiple programming languages...",
    tokenAddress: "codemaster",
    marketCap: 25,
    TVL: 25,
    tokenPrice: 25,
    createdAt: "",
    createdBy: "",
    ui: {
      placeholder: "Ask me about programming..."
    },
    actions: [
      {
        id: "code",
        label: "Code",
        emoji: "💻",
        description: "Generate or explain code"
      },
      {
        id: "debug",
        label: "Debug",
        emoji: "🐛",
        description: "Help identify and fix issues"
      },
      {
        id: "optimize",
        label: "Optimize",
        emoji: "⚡",
        description: "Optimize code performance"
      },
      {
        id: "review",
        label: "Review",
        emoji: "🔍",
        description: "Code review and suggestions"
      },
      {
        id: "test",
        label: "Test",
        emoji: "🧪",
        description: "Generate test cases"
      }
    ],
    frequentQuestions: [
      "How can I optimize this code?",
      "What's the best algorithm for this?",
      "How do I write tests for this?",
      "Can you review my code?"
    ]
  },
  {
    id: "trivia-master",
    name: "TriviaMaster",
    image: "/logos/icon/trivia-master.png",
    description: "Ask me about pop culture, general knowledge, trivia, etc.",
    role: "Entertainment Bot",
    rating: 3.9,
    blockchain: "Avalanche",
    lore: "Trained on countless trivia facts, TriviaMaster is here to amuse and challenge you...",
    tokenAddress: "test",
    marketCap: 30,
    TVL: 30,
    tokenPrice: 30,
    createdAt: "",
    createdBy: "",
    ui: {
      placeholder: "Ask me about trivia..."
    },
    actions: [
      {
        id: "quiz",
        label: "Quiz",
        emoji: "❓",
        description: "Take a quiz on various topics"
      },
      {
        id: "facts",
        label: "Facts",
        emoji: "📚",
        description: "Get interesting facts"
      },
      {
        id: "challenge",
        label: "Challenge",
        emoji: "🎯",
        description: "Challenge your knowledge"
      }
    ],
    frequentQuestions: [
      "What's an interesting fact about...",
      "Can you quiz me on...",
      "Tell me more about..."
    ]
  }
];

// Default agent ID
export const DEFAULT_AGENT_ID = 'code-master';

// Helper function to get agent by ID
export function getAgentById(id: string): AIAgent {
  return availableAgents.find(agent => agent.id === id) || availableAgents[0];
}

// Helper function to get UI config for an agent
export function getAgentUIConfig(agentId: string): AgentUIConfig {
  return getAgentById(agentId).ui;
}

// Helper function to get actions for an agent
export function getAgentActions(agentId: string): AgentAction[] {
  return getAgentById(agentId).actions || [];
}

// Helper function to get frequent questions for an agent
export function getAgentFrequentQuestions(agentId: string): string[] {
  return getAgentById(agentId).frequentQuestions || [];
}

// Convert agents to the shape react-mentions needs
export const mentionAgents = availableAgents.map((agent) => ({
  id: agent.id,
  display: agent.name,
  image: agent.image,
}));

// API function to get agents (mocked for now)
export async function getAgents(): Promise<AIAgent[]> {
  // In a real app, you'd fetch from an API or DB
  return availableAgents;
}
