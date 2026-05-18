import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import Link from 'next/link'

interface Props {
  params: Promise<{ workspace: string }>
}

export default async function BlogListingPage({ params }: Props) {
  const { workspace } = await params
  const payload = await getPayload({ config })

  const tenants = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: workspace } },
    limit: 1,
  })

  if (!tenants.docs.length) return notFound()
  const tenant = tenants.docs[0]

  const posts = await payload.find({
    collection: 'content-items',
    where: {
      and: [
        { tenant: { equals: tenant.id } },
        { status: { equals: 'published' } },
        { contentType: { equals: 'blog_post' } },
      ],
    },
    sort: '-publishedAt',
    limit: 20,
  })

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">{tenant.name} Blog</h1>
      <div className="grid gap-8">
        {posts.docs.map((post) => (
          <article key={post.id} className="border-b pb-6">
            <Link href={`/${post.slug}`}>
              <h2 className="text-xl font-semibold hover:underline">{post.title}</h2>
            </Link>
            {post.excerpt && (
              <p className="text-muted-foreground mt-2">{post.excerpt}</p>
            )}
            {post.publishedAt && (
              <time className="text-sm text-muted-foreground mt-1 block">
                {new Date(post.publishedAt).toLocaleDateString()}
              </time>
            )}
          </article>
        ))}
        {posts.docs.length === 0 && (
          <p className="text-muted-foreground">No posts yet.</p>
        )}
      </div>
    </main>
  )
}
