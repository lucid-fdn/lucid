import Link from 'next/link'

export default function ContentStudioPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Content Studio</h1>
        <p className="text-muted-foreground mt-1">
          Create, manage, and publish content across channels.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/content-admin"
          className="rounded-lg border p-6 hover:bg-accent transition-colors"
        >
          <h3 className="font-semibold">Manage Content</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Open the content editor to create and manage posts.
          </p>
        </Link>
      </div>
    </div>
  )
}
