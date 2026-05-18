import { FEATURES } from '@/lib/features'
import { redirect } from 'next/navigation'
import { getClient } from '@/sanity/client'
import { isSanityConfigured } from '@/sanity/marketing/env'
import { BentoCard } from '@/components/bento-card'
import { Container } from '@/components/container'
import HeroPattern from '@/components/hero-pattern'
import { image } from '@/sanity/image'
import { defineQuery } from 'next-sanity'
import dayjs from 'dayjs'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

type BlogPost = {
  _id: string
  title?: string
  slug?: string
  excerpt?: string
  mainImage?: {
    asset?: {
      _ref: string
    }
    alt?: string
  }
  bodyImage?: {
    _ref: string
    _type: string
  }
  publishedAt?: string
  isFeatured?: boolean
  author?: {
    _id: string
    name?: string
    image?: {
      asset?: {
        _ref: string
      }
    }
  }
  categories?: Array<{
    _id: string
    title?: string
    slug?: string
  }>
}

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Insights, updates, and stories from the Lucid team',
}

const BLOG_POSTS_QUERY = defineQuery(/* groq */ `*[_type == "post"] | order(publishedAt desc) {
  _id,
  title,
  "slug": slug.current,
  excerpt,
  mainImage,
  "bodyImage": body[0].asset,
  publishedAt,
  isFeatured,
  author->{
    _id,
    name,
    image
  },
  categories[]->{
    _id,
    title,
    "slug": slug.current
  }
}`)

async function getPosts(): Promise<BlogPost[]> {
  if (!isSanityConfigured) return []
  const client = getClient()
  const result = await client.fetch(BLOG_POSTS_QUERY)
  return result
}


function BlogContent({ posts }: { posts: BlogPost[] }) {
  return (
    <Container className="py-16">
      <div className="mx-auto max-w-6xl">
        {posts.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-500">No blog posts yet. Check back soon!</p>
          </div>
        ) : (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <Link key={post._id} href={`/blog/${post.slug || ''}`} className="block">
                <BentoCard
                  dark
                  className={
                    index === 0 && posts.length === 1 
                      ? 'lg:rounded-tl-4xl lg:rounded-br-4xl' 
                      : index === 0 
                        ? 'lg:rounded-tl-4xl' 
                        : index === posts.length - 1 
                          ? 'lg:rounded-br-4xl' 
                          : ''
                  }
                  eyebrow={
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <time dateTime={post.publishedAt || ''}>
                        {dayjs(post.publishedAt).format('MMM D, YYYY')}
                      </time>
                      {post.categories && post.categories.length > 0 && (
                        <>
                          <span>•</span>
                          <span>{(post.categories[0] as { title: string }).title}</span>
                        </>
                      )}
                    </div>
                  }
                  title={post.title || ''}
                  description={post.excerpt || ''}
                  graphic={
                    post.mainImage ? (
                      <Image
                        src={image(post.mainImage).size(800, 450).url()}
                        alt={post.mainImage.alt || post.title || ''}
                        width={800}
                        height={450}
                        className="h-full w-full object-cover"
                      />
                    ) : post.bodyImage ? (
                      <Image
                        src={image(post.bodyImage).size(800, 450).url()}
                        alt={post.title || ''}
                        width={800}
                        height={450}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                        <div className="text-center p-8">
                          <div className="w-16 h-16 mx-auto mb-4 bg-gray-300 dark:bg-gray-600 rounded-lg flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400">No image</p>
                        </div>
                      </div>
                    )
                  }
                  fade={['bottom']}
                />
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  )
}

export default async function BlogPage() {
  // Feature flag check
  if (!FEATURES.blog) {
    redirect('/')
  }
  
  const posts = await getPosts()

  return (
    <main className="overflow-hidden">
      <HeroPattern
        title="Lucid Newspaper"
        description="Insights, updates, and stories from the Lucid team"
      />
      <BlogContent posts={posts} />
    </main>
  )
}
