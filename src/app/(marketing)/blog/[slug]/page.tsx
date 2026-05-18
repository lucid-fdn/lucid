import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Container } from '@/components/container'
import { GridPattern } from '@/components/GridPattern'
import { Link } from '@/components/link'
import { Heading, Subheading } from '@/components/heading'
import { image } from '@/sanity/image'
import { getPost } from '@/sanity/queries'
import { ChevronLeftIcon } from '@heroicons/react/16/solid'
import dayjs from 'dayjs'
import type { Metadata } from 'next'
import { PortableText } from 'next-sanity'
import { notFound } from 'next/navigation'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  let { data: post } = await getPost((await params).slug)

  return post ? { title: post.title, description: post.excerpt } : {}
}

export default async function BlogPost({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  let { data: post } = await getPost((await params).slug)
  if (!post) notFound()

  return (
    <main className="overflow-hidden">
        {/* Blog Header */}
       <div className="relative text-center m-auto h-[600px] mb-16">

        <GridPattern
          className="absolute inset-x-0 -top-14 h-[1000px] w-full mask-[linear-gradient(to_bottom_left,white_40%,transparent_50%)] fill-neutral-700/20 stroke-neutral-600/40 z-[2]"
          yOffset={-96}
          interactive
        />

        <div className="relative z-[4] flex flex-col items-center justify-center h-full pt-60">
           <Heading as="h1" dark className="mb-4 max-w-4xl mx-auto text-center break-words">
             {post.title}
           </Heading>
          {post.excerpt && (
            <Subheading dark className="max-w-3xl mx-auto">
              {post.excerpt}
            </Subheading>
          )}
           <Subheading dark className="flex items-center justify-center gap-4 mt-8">
             {post.author && (
               <span className="flex items-center gap-1">
                 {post.author.image && (
                   <Image
                     alt=""
                     src={image(post.author.image).size(48, 48).url()}
                     width={24}
                     height={24}
                     className="aspect-square size-6 mr-1 rounded-full object-cover"
                   />
                 )}
                 <span>{post.author.name}</span>
               </span>
             )}
             {post.author && post.publishedAt && <span>|</span>}
             {post.publishedAt && (
               <span>{dayjs(post.publishedAt).format('MMMM D, YYYY')}</span>
             )}
           </Subheading>
           {Array.isArray(post.categories) && (
             <div className="flex flex-wrap gap-2 justify-center mt-3">
               {post.categories.map((category: { slug: string; title: string }) => (
                 <Link
                   key={category.slug}
                   href={`/blog?category=${category.slug}`}
                   className="rounded-full bg-indigo-50 px-3 py-1 text-sm/4 text-indigo-600 ring-1 ring-indigo-600/20 ring-inset dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/25"
                 >
                   {category.title}
                 </Link>
               ))}
             </div>
            )}
        </div>
       </div>
      
      <Container>
        <div className="grid grid-cols-1 gap-8 pb-24 lg:grid-cols-[10rem_1fr] xl:grid-cols-[10rem_1fr_10rem]">
          <div className="flex flex-wrap items-center gap-8 max-lg:justify-between lg:flex-col lg:items-start">
          </div>
          <div className="text-gray-200 dark:text-gray-300">
            <div className="xl:mx-auto">
              {post.mainImage && (
                <div className="mb-10 max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-xl">
                  <Image
                    alt={post.mainImage.alt || ''}
                    src={image(post.mainImage).size(2016, 1344).url()}
                    width={2016}
                    height={1344}
                    className="aspect-3/2 w-full object-cover"
                    style={{
                      maskImage: 'linear-gradient(to bottom left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0.2) 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom left, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 30%, rgba(0,0,0,0.2) 100%)'
                    }}
                  />
                </div>
              )}
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {Array.isArray(post.body as any) && (
                <PortableText
                  value={post.body as Array<{
                    _type: string
                    _key: string
                    children?: Array<{
                      _type: 'span'
                      _key: string
                      text?: string
                      marks?: string[]
                    }>
                    style?: string
                    markDefs?: Array<{
                      _type: 'link'
                      _key: string
                      href?: string
                    }>
                    level?: number
                    listItem?: string
                    asset?: {
                      _ref: string
                    }
                    alt?: string
                  }>}
                  components={{
                            block: {
                              normal: ({ children }) => (
                                <p className="my-10 text-base/8 first:mt-0 last:mb-0 text-gray-200 dark:text-gray-300">
                                  {children}
                                </p>
                              ),
                              h2: ({ children }) => (
                                <h2 className="mt-12 mb-10 text-2xl/8 font-medium tracking-tight gradient-text-blue first:mt-0 last:mb-0">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="mt-12 mb-10 text-xl/8 font-medium tracking-tight text-white dark:text-white first:mt-0 last:mb-0">
                                  {children}
                                </h3>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="my-10 border-l-2 border-l-gray-400 dark:border-l-gray-600 pl-6 text-base/8 text-gray-200 dark:text-gray-300 first:mt-0 last:mb-0">
                                  {children}
                                </blockquote>
                              ),
                            },
                    types: {
                      image: ({ value }) => (
                        <Image
                          alt={value.alt || ''}
                          src={image(value).width(2000).url()}
                          width={2000}
                          height={1200}
                          className="w-full rounded-2xl"
                        />
                      ),
                      separator: ({ value }) => {
                        switch (value.style) {
                          case 'line':
                            return (
                              <hr className="my-8 border-t border-gray-200" />
                            )
                          case 'space':
                            return <div className="my-8" />
                          default:
                            return null
                        }
                      },
                    },
                            list: {
                              bullet: ({ children }) => (
                                <ul className="list-disc pl-4 text-base/8 marker:text-gray-400 dark:marker:text-gray-500 text-gray-200 dark:text-gray-300">
                                  {children}
                                </ul>
                              ),
                              number: ({ children }) => (
                                <ol className="list-decimal pl-4 text-base/8 marker:text-gray-400 dark:marker:text-gray-500 text-gray-200 dark:text-gray-300">
                                  {children}
                                </ol>
                              ),
                            },
                    listItem: {
                      bullet: ({ children }) => {
                        return (
                          <li className="my-2 pl-2 has-[br]:mb-8">
                            {children}
                          </li>
                        )
                      },
                      number: ({ children }) => {
                        return (
                          <li className="my-2 pl-2 has-[br]:mb-8">
                            {children}
                          </li>
                        )
                      },
                    },
                            marks: {
                              strong: ({ children }) => (
                                <strong className="font-semibold text-white dark:text-white">
                                  {children}
                                </strong>
                              ),
                              code: ({ children }) => (
                                <>
                                  <span aria-hidden className="text-gray-400 dark:text-gray-500">`</span>
                                  <code className="text-[15px]/8 font-semibold text-white dark:text-white bg-gray-800 dark:bg-gray-700 px-1 rounded">
                                    {children}
                                  </code>
                                  <span aria-hidden className="text-gray-400 dark:text-gray-500">`</span>
                                </>
                              ),
                              link: ({ value, children }) => {
                                return (
                                  <Link
                                    href={value.href}
                                    className="font-medium text-blue-400 dark:text-blue-300 underline decoration-blue-400/50 dark:decoration-blue-300/50 underline-offset-4 hover:decoration-blue-400 dark:hover:decoration-blue-300"
                                  >
                                    {children}
                                  </Link>
                                )
                              },
                            },
                  }}
                />
              )}
              <div className="mt-10">
                <Button asChild className="rounded-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Link href="/blog">
                    <ChevronLeftIcon className="size-4" />
                    Back to blog
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </main>
  )
}
