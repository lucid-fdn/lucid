/**
 * Explore Layout
 * 
 * Shared layout for the explore section with category navigation.
 * Apple App Store pattern: Hub + dedicated category pages.
 * 
 * Routes:
 * - /explore           → Hub (curated "Today" tab)
 * - /explore/models    → Model browser
 * - /explore/compute   → GPU marketplace
 * - /explore/connectors → 847 connectors
 * - /explore/agents    → Agent browser
 * - /explore/datasets  → Dataset browser
 */
export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {children}
    </div>
  )
}