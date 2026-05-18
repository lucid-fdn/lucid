import { getFeeds } from '@/lib/oracle/api'
import { FeedCard } from '@/components/oracle/feed-card'
import Link from 'next/link'

export default async function FeedsPage() {
  const { feeds } = await getFeeds()

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-100">Oracle Feeds</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Verifiable economic indexes computed from cross-protocol agent activity
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-8">
        {feeds.map((feed) => (
          <Link key={feed.id} href={`/oracle/feeds/${feed.id}`}>
            <FeedCard feed={feed} />
          </Link>
        ))}
      </div>
    </div>
  )
}
