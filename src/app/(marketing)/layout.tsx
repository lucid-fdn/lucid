import { Footer } from '@/components/footer'
import { UnifiedNavbar } from '@/components/navigation'

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="dark">
      <UnifiedNavbar variant="marketing" />
      {children}
      <Footer />
    </div>
  )
}
