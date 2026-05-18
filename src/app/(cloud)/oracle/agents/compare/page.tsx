import { getAgent } from '@/lib/oracle/api'
import type { AgentDetail } from '@/lib/oracle/api'
import { ComparisonPanel } from '@/components/oracle/comparison-panel'
import Link from 'next/link'

interface ComparePageProps {
  searchParams: Promise<{ ids?: string }>
}

export default async function AgentComparePage({ searchParams }: ComparePageProps) {
  const { ids: idsParam } = await searchParams
  const ids = (idsParam ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4)

  if (ids.length < 2) {
    return (
      <div>
        <Link
          href="/oracle/agents"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4 inline-flex items-center gap-1"
        >
          <span>&larr;</span> Back to Agent Registry
        </Link>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center mt-4">
          <h1 className="text-lg font-bold text-zinc-100 mb-2">Agent Comparison</h1>
          <p className="text-sm text-zinc-500">
            Select at least 2 agents from the registry to compare.
          </p>
          <Link
            href="/oracle/agents"
            className="inline-block mt-4 px-4 py-2 text-xs font-medium rounded bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
          >
            Go to Agent Registry
          </Link>
        </div>
      </div>
    )
  }

  // Fetch all agents in parallel
  const results = await Promise.allSettled(
    ids.map(async (id) => {
      const result = await getAgent(id)
      return result.data as AgentDetail
    }),
  )

  const agents = results
    .filter(
      (r): r is PromiseFulfilledResult<AgentDetail> =>
        r.status === 'fulfilled' && r.value != null,
    )
    .map((r) => r.value)

  if (agents.length < 2) {
    return (
      <div>
        <Link
          href="/oracle/agents"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4 inline-flex items-center gap-1"
        >
          <span>&larr;</span> Back to Agent Registry
        </Link>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-12 text-center mt-4">
          <h1 className="text-lg font-bold text-zinc-100 mb-2">Comparison Failed</h1>
          <p className="text-sm text-zinc-500">
            Could not load enough agent profiles. Some agents may not exist.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link
        href="/oracle/agents"
        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-4 inline-flex items-center gap-1"
      >
        <span>&larr;</span> Back to Agent Registry
      </Link>

      <div className="mb-6 mt-2">
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
          Agent Comparison
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Side-by-side comparison of {agents.length} agents
        </p>
      </div>

      <ComparisonPanel agents={agents} />
    </div>
  )
}
