/**
 * Public Status Page Layout
 * No auth required — minimal layout for public-facing status pages.
 */

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  )
}
