import { SecondaryNav } from '@/components/navigation/secondary-nav'
import { settingsNavigation } from '@/config/settings-nav'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="pt-14 absolute inset-0 flex flex-col md:flex-row overflow-hidden">
      <SecondaryNav 
        title="Settings" 
        sections={settingsNavigation}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
