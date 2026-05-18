import type { BuilderQuestionTopic } from './turn-routing'

type BuilderKnowledgeEntry = {
  answer: string
  facts: string
}

export const builderKnowledge: Record<Exclude<BuilderQuestionTopic, 'status'>, BuilderKnowledgeEntry> = {
  engine: {
    answer: 'Engines are the execution cores the agent runs on. In this builder, engine means OpenClaw or Hermes, not the language model. The model is selected separately inside the engine/runtime stack.',
    facts: 'Engine is the lower-level execution core, such as OpenClaw or Hermes, selected before creation in the builder panel. Engine is not the same thing as the language model.',
  },
  runtime: {
    answer: 'Runtimes are where the agent actually runs. In Lucid, the main runtime modes are Shared, Dedicated, and Bring your own. Shared is the default fastest path, Dedicated reserves Lucid-managed infrastructure, and Bring your own lets you attach your own runtime later.',
    facts: 'Runtime modes are Shared, Dedicated, and Bring your own. Shared is the default fast path. Dedicated reserves Lucid-managed runtime capacity. Bring your own is for attaching external runtime infrastructure.',
  },
  channels: {
    answer: 'Channels are where the agent operates. In the builder, you can keep it on Lucid web chat or add external channels like Slack, Discord, Telegram, WhatsApp, or Teams depending on the setup.',
    facts: 'Channels are where the agent operates, such as Slack, Discord, Telegram, WhatsApp, Teams, or Lucid chat.',
  },
  capabilities: {
    answer: 'Capabilities are the skills, plugins, and tool connections the agent can use. In the builder, you can start with suggested tools, browse the full list, and connect external apps later in one grouped step.',
    facts: 'Capabilities are skills, plugins, and tool connections. Suggested tools can be selected first, then connected in a grouped setup step before creation when auth is required.',
  },
  template: {
    answer: 'Templates are prebuilt starting points. The builder can start from a strong template match or shape a blank setup when your request is more custom.',
    facts: 'Templates are official or community starting points that can prefill the draft, but the live draft remains editable before creation.',
  },
  validation: {
    answer: 'To create an agent, Lucid needs a valid name, a clear role or system prompt, a runtime and engine, and any required template inputs. Before launch, selected apps that need auth must be connected or skipped, and channels should be chosen if the agent needs to work outside Lucid. Skills, memory, schedules, limits, and advanced runtime settings are optional unless the selected template or runtime requires them.',
    facts: 'Agent creation validation requires name, role/system prompt or team objective, valid runtime and engine, required template params, app auth decisions for selected tools, and channel choice when external operation is needed. Optional configuration includes skills, memory, schedules, limits, and advanced runtime settings.',
  },
  lucid: {
    answer: 'Lucid is an agent-building platform for creating, configuring, deploying, and operating AI agents with tools, channels, memory, schedules, templates, and runtime choices.',
    facts: 'Lucid is an agent-building platform. Core concepts include agents, templates, tools and skills, channels, memory, schedules, engines, runtimes, and deployment.',
  },
  company: {
    answer: 'I can answer product-facing Lucid questions from the builder knowledge I have here. For legal, pricing, hiring, fundraising, or private company details, use the official Lucid pages or support source of truth.',
    facts: 'Company-sensitive topics such as legal terms, pricing, hiring, funding, and private corporate details must come from official Lucid source-of-truth documentation, not builder guesses.',
  },
  workflow: {
    answer: 'The builder flow is: draft the agent, select tools and channels, connect required apps in a grouped setup step, review the right panel, create the agent, then test or deploy it.',
    facts: 'Builder workflow: draft setup, choose capabilities, choose schedule if needed, choose channels, connect required apps, review configuration, create, then test or deploy.',
  },
  general: {
    answer: 'I can answer questions about this draft, Lucid builder concepts, tools, channels, templates, engines, runtimes, and the setup flow. If you ask for an actual change, I will update the draft.',
    facts: 'General builder answer scope covers current draft state, Lucid builder concepts, setup workflow, capabilities, channels, templates, engines, and runtimes.',
  },
}

export function answerBuilderKnowledgeQuestion(topic: BuilderQuestionTopic): string {
  if (topic === 'status') {
    return builderKnowledge.general.answer
  }

  return builderKnowledge[topic]?.answer ?? builderKnowledge.general.answer
}

export function getBuilderKnowledgeFacts(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(builderKnowledge).map(([topic, entry]) => [topic, entry.facts]),
  )
}
