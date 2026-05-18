'use client'

import { GridPattern } from '@/components/GridPattern'
import { Heading, Subheading } from '@/components/heading'
import Image from 'next/image'
import { image } from '@/sanity/image'
import dayjs from 'dayjs'

interface BlogHeaderProps {
  post: {
    title: string
    excerpt?: string
    author?: {
      name: string
      image?: {
        asset?: {
          _ref: string
        }
      }
    }
    publishedAt?: string
  }
}

export function BlogHeader({ post }: BlogHeaderProps) {
  return (
    <div className="relative mt-16 mb-16 text-center m-auto h-96">
      <div 
        className="absolute inset-0 bg-[#111111]/70 z-[1]"
      />
      <GridPattern
        className="absolute inset-x-0 -top-14 h-[1000px] w-full mask-[linear-gradient(to_bottom_left,white_40%,transparent_50%)] fill-neutral-700/20 stroke-neutral-600/40 z-[2]"
        yOffset={-96}
        interactive
      />
      <div 
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/50 to-transparent z-[3]"
      />
      <div className="relative z-[4] flex flex-col items-center justify-center h-full">
        <Heading as="h1" dark className="mb-4 max-w-3xl">
          {post.title}
        </Heading>
        {post.excerpt && (
          <Subheading dark>
            {post.excerpt}
          </Subheading>
        )}
        <div className="flex items-center justify-center gap-4 text-sm text-gray-300 mt-6">
          {post.author && (
            <div className="flex items-center gap-2">
              {post.author.image && (
                <Image
                  alt=""
                  src={image(post.author.image).size(32, 32).url()}
                  width={32}
                  height={32}
                  className="aspect-square size-8 rounded-full object-cover"
                />
              )}
              <span>{post.author.name}</span>
            </div>
          )}
          {post.author && post.publishedAt && <span>•</span>}
          {post.publishedAt && (
            <span>{dayjs(post.publishedAt).format('MMMM D, YYYY')}</span>
          )}
        </div>
      </div>
    </div>
  )
}
