import Link from 'next/link'
import Image from 'next/image'
import { urlFor } from '@/lib/sanity'
import type { Post } from '@/types/blog'

interface PostCardProps {
  post: Post
}

export function PostCard({ post }: PostCardProps) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg bg-card shadow-lg transition-shadow hover:shadow-xl">
      {post.mainImage && (
        <div className="aspect-video overflow-hidden">
          <Image
            src={urlFor(post.mainImage).width(400).height(225).url()}
            alt={post.mainImage.alt || post.title}
            width={400}
            height={225}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </time>
          {post.categories && post.categories.length > 0 && (
            <>
              <span>•</span>
              <span>{post.categories[0].title}</span>
            </>
          )}
        </div>
        <h3 className="mt-2 text-xl font-semibold text-foreground group-hover:text-foreground/80">
          <Link href={`/blog/${post.slug.current}`}>
            <span className="absolute inset-0" />
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 flex-1 text-muted-foreground line-clamp-3">{post.excerpt}</p>
        <div className="mt-4 flex items-center gap-3">
          {post.author.avatar && (
            <Image
              src={urlFor(post.author.avatar).width(32).height(32).url()}
              alt={post.author.name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full"
            />
          )}
          <div className="text-sm">
            <p className="font-medium text-foreground">{post.author.name}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
