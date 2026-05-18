import { getPayload } from 'payload'
import config from '@payload-config'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { RichText } from '@payloadcms/richtext-lexical/react'

interface Props {
  params: Promise<{ workspace: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { workspace, slug } = await params
  const payload = await getPayload({ config })

  const tenants = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: workspace } },
    limit: 1,
  })
  if (!tenants.docs.length) return {}

  const posts = await payload.find({
    collection: 'content-items',
    where: {
      and: [
        { tenant: { equals: tenants.docs[0].id } },
        { slug: { equals: slug } },
        { status: { equals: 'published' } },
      ],
    },
    limit: 1,
  })

  const post = posts.docs[0]
  if (!post) return {}

  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt || '',
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { workspace, slug } = await params
  const payload = await getPayload({ config })

  const tenants = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: workspace } },
    limit: 1,
  })
  if (!tenants.docs.length) return notFound()

  const posts = await payload.find({
    collection: 'content-items',
    where: {
      and: [
        { tenant: { equals: tenants.docs[0].id } },
        { slug: { equals: slug } },
        { status: { equals: 'published' } },
        { contentType: { equals: 'blog_post' } },
      ],
    },
    limit: 1,
  })

  const post = posts.docs[0]
  if (!post) return notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <article>
        <h1 className="text-4xl font-bold mb-4">{post.title}</h1>
        {post.publishedAt && (
          <time className="text-sm text-muted-foreground block mb-8">
            {new Date(post.publishedAt).toLocaleDateString()}
          </time>
        )}
        {post.body && (
          <div className="prose prose-lg dark:prose-invert max-w-none">
            <RichText data={post.body} />
          </div>
        )}
      </article>
    </main>
  )
}
