import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Blog',
}

export default function BlogPublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
